import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { requiredString, validUuid } from '../utils/validation.js';

export async function createGroup(req, res) {
  const name = requiredString(req.body?.name, 'name', { max: 120 });
  const group = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO groups (name, created_by, leader_id)
       VALUES ($1, $2, $2)
       RETURNING id, name, created_by, leader_id, created_at`,
      [name, req.user.id],
    );
    const createdGroup = rows[0];
    await client.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [createdGroup.id, req.user.id],
    );
    return createdGroup;
  });

  const { rows: members } = await query(
    `SELECT u.id, u.name, u.email, u.student_code
     FROM group_members gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 ORDER BY u.name`,
    [group.id],
  );
  return res.status(201).json({ ...group, members });
}

export async function listMyGroups(req, res) {
  const { rows } = await query(
    `SELECT g.id, g.name, g.created_by, g.leader_id, g.created_at,
       COALESCE(
         json_agg(json_build_object(
           'id', u.id, 'name', u.name, 'email', u.email, 'student_code', u.student_code
         ) ORDER BY u.name) FILTER (WHERE u.id IS NOT NULL),
         '[]'::json
       ) AS members
     FROM groups g
     JOIN group_members mine ON mine.group_id = g.id AND mine.user_id = $1
     LEFT JOIN group_members gm ON gm.group_id = g.id
     LEFT JOIN users u ON u.id = gm.user_id
     GROUP BY g.id ORDER BY g.created_at DESC`,
    [req.user.id],
  );
  return res.json({ groups: rows });
}

export async function listAllGroups(req, res) {
  const { rows } = await query(
    `SELECT g.id, g.name, g.created_by, g.leader_id, g.created_at,
       COUNT(DISTINCT gm.user_id)::int AS member_count,
       COALESCE(
         json_agg(json_build_object(
           'id', u.id, 'name', u.name, 'email', u.email, 'student_code', u.student_code
         ) ORDER BY u.name) FILTER (WHERE u.id IS NOT NULL),
         '[]'::json
       ) AS members
     FROM groups g
     LEFT JOIN group_members gm ON gm.group_id = g.id
     LEFT JOIN users u ON u.id = gm.user_id
     GROUP BY g.id ORDER BY g.created_at DESC`,
  );
  return res.json({ groups: rows });
}

export async function addMember(req, res) {
  const groupId = validUuid(req.params.groupId, 'groupId');
  const identifier = requiredString(req.body?.identifier, 'identifier', { max: 254 });

  const { rows: groups } = await query(
    'SELECT id FROM groups WHERE id = $1',
    [groupId],
  );
  if (!groups[0]) throw new HttpError(404, 'Group not found');

  const { rows: permissions } = await query(
    `SELECT 1 FROM group_members
     WHERE group_id = $1 AND user_id = $2`,
    [groupId, req.user.id],
  );
  if (!permissions[0]) throw new HttpError(403, 'Only group members can add students');

  const { rows: users } = await query(
    `SELECT id, name, email, student_code FROM users
     WHERE role = 'student' AND (LOWER(email) = LOWER($1) OR UPPER(student_code) = UPPER($1))`,
    [identifier],
  );
  if (!users[0]) throw new HttpError(404, 'No student found with that email or student code');
  if (users.length > 1) {
    throw new HttpError(409, 'That identifier matches more than one student');
  }

  const { rows: existing } = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, users[0].id],
  );
  if (existing[0]) throw new HttpError(409, 'Student is already a member of this group');

  try {
    await query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [groupId, users[0].id],
    );
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Student is already a member of this group');
    }
    throw error;
  }

  return res.status(201).json({ message: 'Student added to group', member: users[0] });
}

export async function transferLeadership(req, res) {
  const groupId = validUuid(req.params.groupId, 'groupId');
  const leaderId = validUuid(req.body?.leader_id, 'leader_id');

  const group = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, created_by, leader_id FROM groups WHERE id = $1 FOR UPDATE',
      [groupId],
    );
    const current = rows[0];
    if (!current) throw new HttpError(404, 'Group not found');
    if (current.leader_id !== req.user.id && current.created_by !== req.user.id) {
      throw new HttpError(403, 'Only the current group leader or creator can transfer leadership');
    }

    const { rows: members } = await client.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, leaderId],
    );
    if (!members[0]) {
      throw new HttpError(400, 'The new leader must be a member of the group');
    }

    const { rows: updated } = await client.query(
      `UPDATE groups SET leader_id = $1 WHERE id = $2
       RETURNING id, name, created_by, leader_id, created_at`,
      [leaderId, groupId],
    );
    return updated[0];
  });

  return res.json({ group });
}

export async function removeMember(req, res) {
  const groupId = validUuid(req.params.groupId, 'groupId');
  const userId = validUuid(req.params.userId, 'userId');

  const { rows: groups } = await query(
    'SELECT created_by, leader_id FROM groups WHERE id = $1',
    [groupId],
  );
  if (!groups[0]) throw new HttpError(404, 'Group not found');
  if (groups[0].created_by !== req.user.id && groups[0].leader_id !== req.user.id) {
    throw new HttpError(403, 'Only the group leader or creator can remove members');
  }
  if (groups[0].leader_id === userId) {
    throw new HttpError(400, 'Transfer group leadership before removing the current leader');
  }

  const { rowCount } = await query(
    'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
  );
  if (!rowCount) throw new HttpError(404, 'Group member not found');
  return res.json({ message: 'Member removed from group' });
}
