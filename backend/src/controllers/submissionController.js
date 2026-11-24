import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import {
  optionalString,
  validUuid,
} from '../utils/validation.js';

export async function confirmSubmission(req, res) {
  const assignmentId = validUuid(req.body?.assignment_id, 'assignment_id');
  const groupId = validUuid(req.body?.group_id, 'group_id');
  if (req.body?.step_one_intent !== true || req.body?.step_two_confirmed !== true) {
    throw new HttpError(400, 'Both submission confirmation steps must be completed');
  }
  const submissionNote = optionalString(req.body?.submission_note, 'submission_note', {
    max: 2000,
  });

  const submission = await withTransaction(async (client) => {
    const { rows: assignmentRows } = await client.query(
      'SELECT id, target_type FROM assignments WHERE id = $1',
      [assignmentId],
    );
    const assignment = assignmentRows[0];
    if (!assignment) throw new HttpError(404, 'Assignment not found');

    const { rows: membershipRows } = await client.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user.id],
    );
    if (!membershipRows[0]) {
      throw new HttpError(403, 'You must be a member of the group to confirm its submission');
    }

    if (assignment.target_type === 'groups') {
      const { rows: targetRows } = await client.query(
        'SELECT 1 FROM assignment_groups WHERE assignment_id = $1 AND group_id = $2',
        [assignmentId, groupId],
      );
      if (!targetRows[0]) {
        throw new HttpError(403, 'This assignment is not assigned to the selected group');
      }
    }

    const { rows } = await client.query(
      `INSERT INTO submissions
         (assignment_id, group_id, confirmed_by, step_one_intent,
          step_two_confirmed, submission_note, submitted_at)
       VALUES ($1, $2, $3, TRUE, TRUE, $4, NOW())
       ON CONFLICT (assignment_id, group_id)
       DO UPDATE SET confirmed_by = EXCLUDED.confirmed_by,
         step_one_intent = TRUE,
         step_two_confirmed = TRUE,
         submission_note = EXCLUDED.submission_note,
         submitted_at = NOW()
       RETURNING id, assignment_id, group_id, confirmed_by,
         step_one_intent, step_two_confirmed, submission_note, submitted_at`,
      [assignmentId, groupId, req.user.id, submissionNote],
    );
    return rows[0];
  });

  return res.status(200).json({ submission });
}

export async function getAnalytics(req, res) {
  const metricsResult = await query(
    `WITH targets AS (
       SELECT a.id AS assignment_id, g.id AS group_id
       FROM assignments a JOIN groups g ON a.target_type = 'all'
       UNION ALL
       SELECT a.id, ag.group_id
       FROM assignments a JOIN assignment_groups ag ON ag.assignment_id = a.id
       WHERE a.target_type = 'groups'
     )
     SELECT
       (SELECT COUNT(*)::int FROM assignments) AS total_assignments,
       (SELECT COUNT(*)::int FROM groups) AS total_groups,
       (SELECT COUNT(DISTINCT id)::int FROM users WHERE role = 'student') AS total_students,
       (SELECT COUNT(*)::int FROM submissions) AS total_submissions,
       CASE WHEN COUNT(t.group_id) = 0 THEN 0
         ELSE ROUND((COUNT(s.assignment_id)::numeric / COUNT(t.group_id)) * 100, 2)
       END AS completion_rate
     FROM targets t
     LEFT JOIN submissions s
       ON s.assignment_id = t.assignment_id AND s.group_id = t.group_id`,
  );

  const assignmentResult = await query(
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
     SELECT a.id AS assignment_id, a.title, a.due_date, a.target_type,
       COUNT(t.group_id)::int AS total_target_groups,
       COUNT(s.assignment_id)::int AS submitted_count,
       COALESCE(
         json_agg(json_build_object(
           'id', t.group_id, 'name', t.group_name,
           'members', COALESCE((
             SELECT json_agg(json_build_object(
               'id', u.id, 'name', u.name, 'email', u.email,
               'student_code', u.student_code
             ) ORDER BY u.name)
             FROM group_members gm JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id = t.group_id
           ), '[]'::json)
         ) ORDER BY t.group_name)
         FILTER (WHERE s.assignment_id IS NOT NULL),
         '[]'::json
       ) AS submitted_groups,
       COALESCE(
         json_agg(json_build_object(
           'id', t.group_id, 'name', t.group_name,
           'members', COALESCE((
             SELECT json_agg(json_build_object(
               'id', u.id, 'name', u.name, 'email', u.email,
               'student_code', u.student_code
             ) ORDER BY u.name)
             FROM group_members gm JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id = t.group_id
           ), '[]'::json)
         ) ORDER BY t.group_name)
         FILTER (WHERE t.group_id IS NOT NULL AND s.assignment_id IS NULL),
         '[]'::json
       ) AS pending_groups
     FROM assignments a
     LEFT JOIN targets t ON t.assignment_id = a.id
     LEFT JOIN submissions s ON s.assignment_id = a.id AND s.group_id = t.group_id
     GROUP BY a.id ORDER BY a.created_at DESC`,
  );

  const groupResult = await query(
    `WITH targets AS (
       SELECT a.id AS assignment_id, g.id AS group_id
       FROM assignments a JOIN groups g ON a.target_type = 'all'
       UNION ALL
       SELECT a.id, ag.group_id
       FROM assignments a JOIN assignment_groups ag ON ag.assignment_id = a.id
       WHERE a.target_type = 'groups'
     )
     SELECT g.id AS group_id, g.name AS group_name,
       COUNT(t.assignment_id)::int AS total_assignments,
       COUNT(s.assignment_id)::int AS submitted_count,
       COUNT(t.assignment_id) - COUNT(s.assignment_id) AS pending_count,
       CASE WHEN COUNT(t.assignment_id) = 0 THEN 0
         ELSE ROUND((COUNT(s.assignment_id)::numeric / COUNT(t.assignment_id)) * 100, 2)
       END AS completion_rate
     FROM groups g
     LEFT JOIN targets t ON t.group_id = g.id
     LEFT JOIN submissions s ON s.assignment_id = t.assignment_id AND s.group_id = g.id
     GROUP BY g.id ORDER BY g.name`,
  );

  return res.json({
    summary: metricsResult.rows[0],
    assignments: assignmentResult.rows,
    groups: groupResult.rows,
  });
}
