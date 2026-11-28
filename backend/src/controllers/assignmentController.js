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
  const targetType = body.target_type === undefined ? current.target_type : body.target_type;
  if (!['all', 'groups'].includes(targetType)) {
    throw new HttpError(400, "target_type must be either 'all' or 'groups'");
  }
  const submissionType = body.submission_type === undefined
    ? current.submission_type ?? 'group'
    : body.submission_type;
  if (!['individual', 'group'].includes(submissionType)) {
    throw new HttpError(400, "submission_type must be either 'individual' or 'group'");
  }

  let courseId = current.course_id ?? null;
  if (body.course_id !== undefined) {
    courseId = body.course_id === null || body.course_id === ''
      ? null
      : validUuid(body.course_id, 'course_id');
  }

  return { title, description, dueDate, onedriveLink, targetType, submissionType, courseId };
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

async function validateCourse(client, courseId, user) {
  if (!courseId) return;
  const { rows } = await client.query(
    `SELECT id FROM courses
     WHERE id = $1 AND ($2::boolean OR professor_id = $3)`,
    [courseId, user.role === 'admin', user.id],
  );
  if (!rows[0]) {
    const { rows: courses } = await client.query('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (!courses[0]) throw new HttpError(404, 'Course not found');
    throw new HttpError(403, 'Professors may only manage assignments for their own courses');
  }
}

async function assertCanManageAssignment(client, assignment, user) {
  if (user.role === 'admin') return;
  if (assignment.course_id) {
    const { rows } = await client.query(
      'SELECT 1 FROM courses WHERE id = $1 AND professor_id = $2',
      [assignment.course_id, user.id],
    );
    if (rows[0]) return;
  } else if (assignment.created_by === user.id) {
    return;
  }
  throw new HttpError(403, 'You may only manage assignments for your own courses');
}

export async function createAssignment(req, res) {
  const values = assignmentInput(req.body ?? {});
  const ids = groupIds(req.body?.group_ids);
  if (values.targetType === 'groups' && ids.length === 0) {
    throw new HttpError(400, 'group_ids must contain at least one group for group assignments');
  }

  const assignment = await withTransaction(async (client) => {
    await validateGroupIds(client, ids);
    await validateCourse(client, values.courseId, req.user);
    const { rows } = await client.query(
      `INSERT INTO assignments
         (title, description, due_date, onedrive_link, target_type,
          submission_type, course_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, title, description, due_date, onedrive_link, target_type,
         submission_type, course_id, created_by, created_at`,
      [
        values.title,
        values.description,
        values.dueDate,
        values.onedriveLink,
        values.targetType,
        values.submissionType,
        values.courseId,
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
      `SELECT id, title, description, due_date, onedrive_link, target_type,
         submission_type, course_id, created_by
       FROM assignments WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!existingRows[0]) throw new HttpError(404, 'Assignment not found');
    const existing = existingRows[0];
    await assertCanManageAssignment(client, existing, req.user);
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
    await validateCourse(client, values.courseId, req.user);

    const { rows } = await client.query(
      `UPDATE assignments
       SET title = $1, description = $2, due_date = $3, onedrive_link = $4,
         target_type = $5, submission_type = $6, course_id = $7
       WHERE id = $8
       RETURNING id, title, description, due_date, onedrive_link, target_type,
         submission_type, course_id, created_by, created_at`,
      [
        values.title,
        values.description,
        values.dueDate,
        values.onedriveLink,
        values.targetType,
        values.submissionType,
        values.courseId,
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
    const { rows } = await client.query(
      'SELECT id, course_id, created_by FROM assignments WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!rows[0]) throw new HttpError(404, 'Assignment not found');
    await assertCanManageAssignment(client, rows[0], req.user);
    await client.query('DELETE FROM submissions WHERE assignment_id = $1', [id]);
    await client.query('DELETE FROM assignment_groups WHERE assignment_id = $1', [id]);
    await client.query('DELETE FROM assignments WHERE id = $1', [id]);
  });
  return res.status(204).end();
}

export async function listAssignments(req, res) {
  const courseId = req.query.courseId === undefined
    ? null
    : validUuid(req.query.courseId, 'courseId');

  if (req.user.role !== 'student') {
    const { rows } = await query(
      `WITH assignment_targets AS (
         SELECT a.id AS assignment_id, g.id AS target_id, g.name AS target_name,
           g.id AS group_id, NULL::uuid AS student_id, 'group'::text AS target_type
         FROM assignments a
         JOIN groups g ON a.submission_type = 'group' AND (
           a.target_type = 'all' OR EXISTS (
             SELECT 1 FROM assignment_groups ag
             WHERE ag.assignment_id = a.id AND ag.group_id = g.id
           )
         )
         UNION ALL
         SELECT a.id, u.id, u.name, NULL::uuid, u.id, 'individual'::text
         FROM assignments a
         JOIN users u ON a.submission_type = 'individual' AND u.role = 'student'
         WHERE (a.course_id IS NULL OR EXISTS (
           SELECT 1 FROM course_enrollments ce
           WHERE ce.course_id = a.course_id AND ce.student_id = u.id
         ))
         AND (a.target_type = 'all' OR EXISTS (
           SELECT 1 FROM assignment_groups ag
           JOIN group_members gm ON gm.group_id = ag.group_id
           WHERE ag.assignment_id = a.id AND gm.user_id = u.id
         ))
       ),
       target_rows AS (
         SELECT t.*, s.id AS submission_id, s.status, s.submitted_at,
           s.confirmed_by, confirmer.name AS confirmed_by_name,
           s.acknowledged_by, acknowledger.name AS acknowledged_by_name,
           s.acknowledged_at, s.submission_note
         FROM assignment_targets t
         LEFT JOIN submissions s ON s.assignment_id = t.assignment_id
           AND ((t.target_type = 'group' AND s.group_id = t.group_id)
             OR (t.target_type = 'individual' AND s.student_id = t.student_id))
         LEFT JOIN users confirmer ON confirmer.id = s.confirmed_by
         LEFT JOIN users acknowledger ON acknowledger.id = s.acknowledged_by
       )
       SELECT a.id, a.title, a.description, a.due_date, a.onedrive_link,
         a.target_type, a.submission_type, a.course_id, c.title AS course_title,
         c.code AS course_code, a.created_by, a.created_at,
         COUNT(t.target_id)::int AS total_target_count,
         COUNT(t.submission_id)::int AS submitted_count,
         COUNT(t.submission_id) FILTER (WHERE t.status = 'acknowledged')::int
           AS acknowledged_count,
         COALESCE(json_agg(json_build_object(
           'id', t.group_id, 'name', t.target_name, 'status', COALESCE(t.status, 'pending'),
           'submitted', t.submission_id IS NOT NULL, 'submitted_at', t.submitted_at,
           'confirmed_by', t.confirmed_by, 'confirmed_by_name', t.confirmed_by_name,
           'acknowledged_by', t.acknowledged_by,
           'acknowledged_by_name', t.acknowledged_by_name,
           'acknowledged_at', t.acknowledged_at, 'submission_note', t.submission_note
         ) ORDER BY t.target_name)
           FILTER (WHERE t.target_type = 'group'), '[]'::json) AS groups,
         COALESCE(json_agg(json_build_object(
           'id', t.student_id, 'name', t.target_name,
           'status', COALESCE(t.status, 'pending'),
           'submitted', t.submission_id IS NOT NULL, 'submitted_at', t.submitted_at,
           'confirmed_by', t.confirmed_by, 'confirmed_by_name', t.confirmed_by_name,
           'acknowledged_by', t.acknowledged_by,
           'acknowledged_by_name', t.acknowledged_by_name,
           'acknowledged_at', t.acknowledged_at, 'submission_note', t.submission_note
         ) ORDER BY t.target_name)
           FILTER (WHERE t.target_type = 'individual'), '[]'::json) AS students
       FROM assignments a
       LEFT JOIN courses c ON c.id = a.course_id
       LEFT JOIN target_rows t ON t.assignment_id = a.id
       WHERE ($1::uuid IS NULL OR a.course_id = $1)
         AND ($2::boolean OR c.professor_id = $3
           OR (a.course_id IS NULL AND a.created_by = $3))
       GROUP BY a.id, c.title, c.code
       ORDER BY a.due_date NULLS LAST, a.created_at DESC`,
      [courseId, req.user.role === 'admin', req.user.id],
    );
    return res.json({ assignments: rows });
  }

  const { rows } = await query(
    `SELECT a.id, a.title, a.description, a.due_date, a.onedrive_link,
       a.target_type, a.submission_type, a.course_id, c.title AS course_title,
       c.code AS course_code, a.created_by, a.created_at,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', g.id, 'name', g.name, 'is_leader', g.leader_id = $1,
           'status', COALESCE(s.status, 'pending'),
           'submitted', s.id IS NOT NULL, 'submitted_at', s.submitted_at,
           'confirmed_by_name', confirmer.name, 'submission_note', s.submission_note,
           'acknowledged_by', s.acknowledged_by, 'acknowledged_at', s.acknowledged_at
         ) ORDER BY g.name)
         FROM group_members gm
         JOIN groups g ON g.id = gm.group_id
         LEFT JOIN assignment_groups ag
           ON ag.assignment_id = a.id AND ag.group_id = g.id
         LEFT JOIN submissions s
           ON s.assignment_id = a.id AND s.group_id = g.id
         LEFT JOIN users confirmer ON confirmer.id = s.confirmed_by
         WHERE gm.user_id = $1 AND a.submission_type = 'group'
           AND (a.target_type = 'all' OR ag.group_id IS NOT NULL)
       ), '[]'::json) AS group_status,
       CASE WHEN a.submission_type = 'individual' THEN (
         SELECT json_build_object(
           'status', s.status, 'submitted', s.id IS NOT NULL,
           'submitted_at', s.submitted_at, 'submission_note', s.submission_note,
           'acknowledged_by', s.acknowledged_by, 'acknowledged_at', s.acknowledged_at
         )
         FROM submissions s
         WHERE s.assignment_id = a.id AND s.student_id = $1
       ) ELSE NULL END AS my_submission
     FROM assignments a
     LEFT JOIN courses c ON c.id = a.course_id
     WHERE ((
       a.submission_type = 'group' AND EXISTS (
         SELECT 1 FROM group_members gm
         LEFT JOIN assignment_groups ag
           ON ag.assignment_id = a.id AND ag.group_id = gm.group_id
         WHERE gm.user_id = $1 AND (a.target_type = 'all' OR ag.group_id IS NOT NULL)
       )
     ) OR (
       a.submission_type = 'individual'
       AND (a.course_id IS NULL OR EXISTS (
         SELECT 1 FROM course_enrollments ce
         WHERE ce.course_id = a.course_id AND ce.student_id = $1
       ))
       AND (a.target_type = 'all' OR EXISTS (
         SELECT 1 FROM assignment_groups ag
         JOIN group_members gm ON gm.group_id = ag.group_id
         WHERE ag.assignment_id = a.id AND gm.user_id = $1
       ))
     ))
     AND ($2::uuid IS NULL OR a.course_id = $2)
     ORDER BY a.due_date NULLS LAST, a.created_at DESC`,
    [req.user.id, courseId],
  );
  return res.json({ assignments: rows });
}
