import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { optionalString, validUuid } from '../utils/validation.js';

export async function confirmSubmission(req, res) {
  const assignmentId = validUuid(req.body?.assignment_id, 'assignment_id');
  if (req.body?.step_one_intent !== true || req.body?.step_two_confirmed !== true) {
    throw new HttpError(400, 'Both submission confirmation steps must be completed');
  }
  const submissionNote = optionalString(req.body?.submission_note, 'submission_note', {
    max: 2000,
  });

  const submission = await withTransaction(async (client) => {
    const { rows: assignmentRows } = await client.query(
      `SELECT id, course_id, target_type, submission_type
       FROM assignments WHERE id = $1 FOR UPDATE`,
      [assignmentId],
    );
    const assignment = assignmentRows[0];
    if (!assignment) throw new HttpError(404, 'Assignment not found');

    if (assignment.course_id) {
      const { rows: enrollmentRows } = await client.query(
        'SELECT 1 FROM course_enrollments WHERE course_id = $1 AND student_id = $2',
        [assignment.course_id, req.user.id],
      );
      if (!enrollmentRows[0]) {
        throw new HttpError(403, 'You must be enrolled in this course to submit this assignment');
      }
    }

    if (assignment.submission_type === 'group') {
      const groupId = validUuid(req.body?.group_id, 'group_id');
      const { rows: membershipRows } = await client.query(
        `SELECT g.leader_id, gm.user_id
         FROM groups g
         LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $2
         WHERE g.id = $1`,
        [groupId, req.user.id],
      );
      if (!membershipRows[0]) throw new HttpError(404, 'Group not found');
      if (!membershipRows[0].user_id) {
        throw new HttpError(403, 'You must be a member of the group to confirm its submission');
      }
      if (membershipRows[0].leader_id !== req.user.id) {
        throw new HttpError(403, 'Only the group leader may confirm this group submission');
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
           (assignment_id, group_id, confirmed_by, status, step_one_intent,
            step_two_confirmed, submission_note, submitted_at)
         VALUES ($1, $2, $3, 'submitted', TRUE, TRUE, $4, NOW())
         ON CONFLICT (assignment_id, group_id) WHERE group_id IS NOT NULL
         DO UPDATE SET confirmed_by = EXCLUDED.confirmed_by,
           status = 'submitted', acknowledged_by = NULL, acknowledged_at = NULL,
           step_one_intent = TRUE, step_two_confirmed = TRUE,
           submission_note = EXCLUDED.submission_note, submitted_at = NOW()
         RETURNING id, assignment_id, group_id, student_id, confirmed_by, status,
           acknowledged_by, acknowledged_at, step_one_intent, step_two_confirmed,
           submission_note, submitted_at`,
        [assignmentId, groupId, req.user.id, submissionNote],
      );
      return rows[0];
    }

    if (assignment.target_type === 'groups') {
      const { rows: targetRows } = await client.query(
        `SELECT 1
         FROM assignment_groups ag
         JOIN group_members gm ON gm.group_id = ag.group_id
         WHERE ag.assignment_id = $1 AND gm.user_id = $2`,
        [assignmentId, req.user.id],
      );
      if (!targetRows[0]) {
        throw new HttpError(403, 'This assignment is not assigned to you');
      }
    }

    const { rows } = await client.query(
      `INSERT INTO submissions
         (assignment_id, student_id, confirmed_by, status, step_one_intent,
          step_two_confirmed, submission_note, submitted_at)
       VALUES ($1, $2, $2, 'submitted', TRUE, TRUE, $3, NOW())
       ON CONFLICT (assignment_id, student_id) WHERE student_id IS NOT NULL
       DO UPDATE SET confirmed_by = EXCLUDED.confirmed_by,
         status = 'submitted', acknowledged_by = NULL, acknowledged_at = NULL,
         step_one_intent = TRUE, step_two_confirmed = TRUE,
         submission_note = EXCLUDED.submission_note, submitted_at = NOW()
       RETURNING id, assignment_id, group_id, student_id, confirmed_by, status,
         acknowledged_by, acknowledged_at, step_one_intent, step_two_confirmed,
         submission_note, submitted_at`,
      [assignmentId, req.user.id, submissionNote],
    );
    return rows[0];
  });

  return res.status(200).json({ submission });
}

export async function acknowledgeSubmission(req, res) {
  const assignmentId = validUuid(req.body?.assignment_id, 'assignment_id');

  const submission = await withTransaction(async (client) => {
    const { rows: assignmentRows } = await client.query(
      'SELECT id, submission_type, target_type FROM assignments WHERE id = $1',
      [assignmentId],
    );
    const assignment = assignmentRows[0];
    if (!assignment) throw new HttpError(404, 'Assignment not found');

    if (assignment.submission_type === 'group') {
      const groupId = validUuid(req.body?.group_id, 'group_id');
      const { rows: groups } = await client.query(
        'SELECT id, leader_id FROM groups WHERE id = $1',
        [groupId],
      );
      if (!groups[0]) throw new HttpError(404, 'Group not found');
      if (groups[0].leader_id !== req.user.id) {
        throw new HttpError(403, 'Only the group leader may acknowledge this group submission');
      }
      const { rows: memberships } = await client.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, req.user.id],
      );
      if (!memberships[0]) {
        throw new HttpError(403, 'The group leader must be a member of the group to acknowledge');
      }
      if (assignment.target_type === 'groups') {
        const { rows: targets } = await client.query(
          'SELECT 1 FROM assignment_groups WHERE assignment_id = $1 AND group_id = $2',
          [assignmentId, groupId],
        );
        if (!targets[0]) throw new HttpError(403, 'This assignment is not assigned to the selected group');
      }

      const { rows } = await client.query(
        `UPDATE submissions
         SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW()
         WHERE assignment_id = $2 AND group_id = $3
         RETURNING id, assignment_id, group_id, student_id, confirmed_by, status,
           acknowledged_by, acknowledged_at, step_one_intent, step_two_confirmed,
           submission_note, submitted_at`,
        [req.user.id, assignmentId, groupId],
      );
      if (!rows[0]) throw new HttpError(404, 'No submission exists for this group and assignment');
      return rows[0];
    }

    if (req.body?.group_id !== undefined && req.body.group_id !== null && req.body.group_id !== '') {
      throw new HttpError(400, 'group_id must not be provided for an individual assignment');
    }
    const { rows } = await client.query(
      `UPDATE submissions
       SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW()
       WHERE assignment_id = $2 AND student_id = $1
       RETURNING id, assignment_id, group_id, student_id, confirmed_by, status,
         acknowledged_by, acknowledged_at, step_one_intent, step_two_confirmed,
         submission_note, submitted_at`,
      [req.user.id, assignmentId],
    );
    if (!rows[0]) throw new HttpError(404, 'No individual submission exists for this assignment');
    return rows[0];
  });

  return res.json({ submission });
}

export async function getAnalytics(req, res) {
  const courseId = req.query.courseId === undefined
    ? null
    : validUuid(req.query.courseId, 'courseId');
  const status = req.query.status ?? 'all';
  if (!['all', 'pending', 'submitted', 'acknowledged'].includes(status)) {
    throw new HttpError(400, "status must be 'all', 'pending', 'submitted', or 'acknowledged'");
  }

  const { rows } = await query(
    `WITH assignment_targets AS (
       SELECT a.id AS assignment_id, a.title AS assignment_title, a.due_date,
         a.target_type AS assignment_target_type, a.submission_type, a.course_id,
         c.title AS course_title, c.code AS course_code,
         g.id AS group_id, g.name AS group_name, NULL::uuid AS student_id,
         NULL::text AS student_name, 'group'::text AS target_kind
       FROM assignments a
       LEFT JOIN courses c ON c.id = a.course_id
       JOIN groups g ON a.submission_type = 'group' AND (
         a.target_type = 'all' OR EXISTS (
           SELECT 1 FROM assignment_groups ag
           WHERE ag.assignment_id = a.id AND ag.group_id = g.id
         )
       )
       WHERE ($1::uuid IS NULL OR a.course_id = $1)
         AND ($2::boolean OR c.professor_id = $3
           OR (a.course_id IS NULL AND a.created_by = $3))
       UNION ALL
       SELECT a.id, a.title, a.due_date, a.target_type, a.submission_type,
         a.course_id, c.title, c.code, NULL::uuid, NULL::text, u.id, u.name,
         'individual'::text
       FROM assignments a
       LEFT JOIN courses c ON c.id = a.course_id
       JOIN users u ON a.submission_type = 'individual' AND u.role = 'student'
       WHERE ($1::uuid IS NULL OR a.course_id = $1)
         AND ($2::boolean OR c.professor_id = $3
           OR (a.course_id IS NULL AND a.created_by = $3))
         AND (a.course_id IS NULL OR EXISTS (
           SELECT 1 FROM course_enrollments ce
           WHERE ce.course_id = a.course_id AND ce.student_id = u.id
         ))
         AND (a.target_type = 'all' OR EXISTS (
           SELECT 1 FROM assignment_groups ag
           JOIN group_members gm ON gm.group_id = ag.group_id
           WHERE ag.assignment_id = a.id AND gm.user_id = u.id
         ))
     ),
     target_status AS (
       SELECT t.*, s.id AS submission_id, s.status, s.submitted_at,
         s.acknowledged_by, ack.name AS acknowledged_by_name, s.acknowledged_at
       FROM assignment_targets t
       LEFT JOIN submissions s ON s.assignment_id = t.assignment_id
         AND ((t.target_kind = 'group' AND s.group_id = t.group_id)
           OR (t.target_kind = 'individual' AND s.student_id = t.student_id))
       LEFT JOIN users ack ON ack.id = s.acknowledged_by
     )
     SELECT ts.*,
       CASE WHEN ts.target_kind = 'group' THEN COALESCE((
         SELECT json_agg(json_build_object(
           'id', u.id, 'name', u.name, 'email', u.email, 'student_code', u.student_code
         ) ORDER BY u.name)
         FROM group_members gm JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ts.group_id
       ), '[]'::json) ELSE '[]'::json END AS members
     FROM target_status ts
     WHERE ($4 = 'all'
       OR ($4 = 'pending' AND ts.submission_id IS NULL)
       OR ($4 = 'submitted' AND ts.status = 'submitted')
       OR ($4 = 'acknowledged' AND ts.status = 'acknowledged'))
     ORDER BY ts.due_date NULLS LAST, ts.assignment_title, ts.group_name, ts.student_name`,
    [courseId, req.user.role === 'admin', req.user.id, status],
  );

  const assignmentsById = new Map();
  const groupsById = new Map();
  const summary = {
    total_assignments: 0,
    total_targets: 0,
    pending_count: 0,
    submitted_count: 0,
    acknowledged_count: 0,
  };

  for (const row of rows) {
    let assignment = assignmentsById.get(row.assignment_id);
    if (!assignment) {
      assignment = {
        id: row.assignment_id,
        title: row.assignment_title,
        due_date: row.due_date,
        target_type: row.assignment_target_type,
        submission_type: row.submission_type,
        course_id: row.course_id,
        course_title: row.course_title,
        course_code: row.course_code,
        total_targets: 0,
        pending_count: 0,
        submitted_count: 0,
        acknowledged_count: 0,
        groups: [],
        students: [],
      };
      assignmentsById.set(row.assignment_id, assignment);
    }

    const targetStatus = row.submission_id ? row.status : 'pending';
    assignment.total_targets += 1;
    summary.total_targets += 1;
    if (targetStatus === 'pending') {
      assignment.pending_count += 1;
      summary.pending_count += 1;
    } else if (targetStatus === 'submitted') {
      assignment.submitted_count += 1;
      summary.submitted_count += 1;
    } else if (targetStatus === 'acknowledged') {
      assignment.acknowledged_count += 1;
      summary.acknowledged_count += 1;
    }

    const target = row.target_kind === 'group'
      ? {
        id: row.group_id,
        name: row.group_name,
        status: targetStatus,
        submitted_at: row.submitted_at,
        acknowledged_by: row.acknowledged_by,
        acknowledged_by_name: row.acknowledged_by_name,
        acknowledged_at: row.acknowledged_at,
        members: row.members,
      }
      : {
        id: row.student_id,
        name: row.student_name,
        status: targetStatus,
        submitted_at: row.submitted_at,
        acknowledged_by: row.acknowledged_by,
        acknowledged_by_name: row.acknowledged_by_name,
        acknowledged_at: row.acknowledged_at,
      };
    if (row.target_kind === 'group') {
      assignment.groups.push(target);
      let group = groupsById.get(row.group_id);
      if (!group) {
        group = {
          group_id: row.group_id,
          group_name: row.group_name,
          total_assignments: 0,
          pending_count: 0,
          submitted_count: 0,
          acknowledged_count: 0,
          acknowledgment_count: 0,
          assignments: [],
        };
        groupsById.set(row.group_id, group);
      }
      group.total_assignments += 1;
      group.assignments.push({
        assignment_id: row.assignment_id,
        assignment_title: row.assignment_title,
        status: targetStatus,
        acknowledged_by: row.acknowledged_by,
        acknowledged_at: row.acknowledged_at,
      });
      if (targetStatus === 'pending') group.pending_count += 1;
      else if (targetStatus === 'submitted') group.submitted_count += 1;
      else if (targetStatus === 'acknowledged') {
        group.acknowledged_count += 1;
        group.acknowledgment_count += 1;
      }
    } else {
      assignment.students.push(target);
    }
  }

  summary.total_assignments = assignmentsById.size;
  return res.json({
    summary,
    assignments: [...assignmentsById.values()],
    groups: [...groupsById.values()],
  });
}
