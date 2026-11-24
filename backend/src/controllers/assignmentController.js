import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import {
  groupIds,
  optionalDate,
  optionalString,
  optionalUrl,
  requiredString,
  validUuid,
} from '../utils/validation.js';

function assignmentInput(body, current = {}) {
  const title = body.title === undefined
    ? current.title
    : requiredString(body.title, 'title', { max: 200 });
  if (!title) throw new HttpError(400, 'title is required');

  const description = body.description === undefined
    ? current.description ?? null
    : optionalString(body.description, 'description');
  const dueDate = body.due_date === undefined
    ? current.due_date ?? null
    : optionalDate(body.due_date, 'due_date');
  const onedriveLink = body.onedrive_link === undefined
    ? current.onedrive_link ?? null
    : optionalUrl(body.onedrive_link, 'onedrive_link');
  const targetType = body.target_type === undefined
    ? current.target_type
    : body.target_type;
  if (!['all', 'groups'].includes(targetType)) {
    throw new HttpError(400, "target_type must be either 'all' or 'groups'");
  }

  return { title, description, dueDate, onedriveLink, targetType };
}

async function validateGroupIds(client, ids) {
  if (ids.length === 0) return;
  const { rows } = await client.query(
    'SELECT id FROM groups WHERE id = ANY($1::uuid[])',
    [ids],
  );
  if (rows.length !== ids.length) {
    throw new HttpError(400, 'One or more group_ids do not exist');
  }
}

export async function createAssignment(req, res) {
  const values = assignmentInput(req.body ?? {});
  const ids = groupIds(req.body?.group_ids);
  if (values.targetType === 'groups' && ids.length === 0) {
    throw new HttpError(400, 'group_ids must contain at least one group for group assignments');
  }

  const assignment = await withTransaction(async (client) => {
    await validateGroupIds(client, ids);
    const { rows } = await client.query(
      `INSERT INTO assignments
         (title, description, due_date, onedrive_link, target_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, description, due_date, onedrive_link, target_type, created_by, created_at`,
      [
        values.title,
        values.description,
        values.dueDate,
        values.onedriveLink,
        values.targetType,
        req.user.id,
      ],
    );
    const created = rows[0];
    if (values.targetType === 'groups') {
      await client.query(
        'INSERT INTO assignment_groups (assignment_id, group_id) SELECT $1, unnest($2::uuid[])',
        [created.id, ids],
      );
    }
    return created;
  });

  return res.status(201).json({ assignment });
}

export async function updateAssignment(req, res) {
  const id = validUuid(req.params.id, 'id');
  const assignment = await withTransaction(async (client) => {
    const { rows: existingRows } = await client.query(
      `SELECT id, title, description, due_date, onedrive_link, target_type
       FROM assignments WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!existingRows[0]) throw new HttpError(404, 'Assignment not found');
    const existing = existingRows[0];
    const values = assignmentInput(req.body ?? {}, existing);

    let ids;
    if (req.body?.group_ids === undefined) {
      const { rows } = await client.query(
        'SELECT group_id FROM assignment_groups WHERE assignment_id = $1',
        [id],
      );
      ids = rows.map((row) => row.group_id);
    } else {
      ids = groupIds(req.body.group_ids);
    }
    if (values.targetType === 'groups' && ids.length === 0) {
      throw new HttpError(400, 'group_ids must contain at least one group for group assignments');
    }
    await validateGroupIds(client, ids);

    const { rows } = await client.query(
      `UPDATE assignments
       SET title = $1, description = $2, due_date = $3, onedrive_link = $4, target_type = $5
       WHERE id = $6
       RETURNING id, title, description, due_date, onedrive_link, target_type, created_by, created_at`,
      [
        values.title,
        values.description,
        values.dueDate,
        values.onedriveLink,
        values.targetType,
        id,
      ],
    );
    await client.query('DELETE FROM assignment_groups WHERE assignment_id = $1', [id]);
    if (values.targetType === 'groups') {
      await client.query(
        'INSERT INTO assignment_groups (assignment_id, group_id) SELECT $1, unnest($2::uuid[])',
        [id, ids],
      );
    }
    return rows[0];
  });

  return res.json({ assignment });
}

export async function deleteAssignment(req, res) {
  const id = validUuid(req.params.id, 'id');
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id FROM assignments WHERE id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, 'Assignment not found');
    await client.query('DELETE FROM submissions WHERE assignment_id = $1', [id]);
    await client.query('DELETE FROM assignment_groups WHERE assignment_id = $1', [id]);
    await client.query('DELETE FROM assignments WHERE id = $1', [id]);
  });
  return res.status(204).end();
}

export async function listAssignments(req, res) {
  if (req.user.role === 'admin') {
    const { rows } = await query(
      `WITH targets AS (
         SELECT a.id AS assignment_id, g.id AS group_id, g.name AS group_name
         FROM assignments a JOIN groups g ON a.target_type = 'all'
         UNION ALL
         SELECT a.id, g.id, g.name
         FROM assignments a
         JOIN assignment_groups ag ON ag.assignment_id = a.id
         JOIN groups g ON g.id = ag.group_id
         WHERE a.target_type = 'groups'
       )
       SELECT a.id, a.title, a.description, a.due_date, a.onedrive_link,
         a.target_type, a.created_by, a.created_at,
         COUNT(t.group_id)::int AS total_target_groups,
         COUNT(s.assignment_id)::int AS submitted_count,
         COALESCE(
           json_agg(json_build_object(
             'id', t.group_id, 'name', t.group_name,
             'submitted', s.assignment_id IS NOT NULL,
             'submitted_at', s.submitted_at,
             'confirmed_by_name', confirmer.name
           ) ORDER BY t.group_name) FILTER (WHERE t.group_id IS NOT NULL),
           '[]'::json
         ) AS groups
       FROM assignments a
       LEFT JOIN targets t ON t.assignment_id = a.id
       LEFT JOIN submissions s ON s.assignment_id = a.id AND s.group_id = t.group_id
       LEFT JOIN users confirmer ON confirmer.id = s.confirmed_by
       GROUP BY a.id ORDER BY a.created_at DESC`,
    );
    return res.json({ assignments: rows });
  }

  const { rows } = await query(
    `SELECT a.id, a.title, a.description, a.due_date, a.onedrive_link,
       a.target_type, a.created_by, a.created_at,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', g.id, 'name', g.name,
           'submitted', s.assignment_id IS NOT NULL,
           'submitted_at', s.submitted_at,
           'confirmed_by_name', confirmer.name,
           'submission_note', s.submission_note
         ) ORDER BY g.name)
         FROM group_members gm
         JOIN groups g ON g.id = gm.group_id
         LEFT JOIN assignment_groups ag
           ON ag.assignment_id = a.id AND ag.group_id = g.id
         LEFT JOIN submissions s
           ON s.assignment_id = a.id AND s.group_id = g.id
         LEFT JOIN users confirmer ON confirmer.id = s.confirmed_by
         WHERE gm.user_id = $1 AND (a.target_type = 'all' OR ag.group_id IS NOT NULL)
       ), '[]'::json) AS group_status
     FROM assignments a
     WHERE EXISTS (
       SELECT 1 FROM group_members gm
       WHERE gm.user_id = $1
         AND (a.target_type = 'all' OR EXISTS (
           SELECT 1 FROM assignment_groups ag
           WHERE ag.assignment_id = a.id AND ag.group_id = gm.group_id
         ))
     )
     ORDER BY a.due_date NULLS LAST, a.created_at DESC`,
    [req.user.id],
  );
  return res.json({ assignments: rows });
}
