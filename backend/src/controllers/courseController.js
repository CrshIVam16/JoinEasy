import { query } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { optionalString, requiredString, validUuid } from '../utils/validation.js';

export async function listCourses(req, res) {
  if (req.user.role === 'student') {
    const { rows } = await query(
      `SELECT c.id, c.code, c.title, c.description, c.professor_id, c.created_at,
         professor.name AS professor_name,
         COUNT(DISTINCT a.id)::int AS assignment_count,
         COALESCE(
           json_agg(json_build_object(
             'id', a.id, 'title', a.title, 'due_date', a.due_date,
             'submission_type', a.submission_type
           ) ORDER BY a.due_date NULLS LAST, a.created_at DESC)
           FILTER (WHERE a.id IS NOT NULL),
           '[]'::json
         ) AS assignments
       FROM course_enrollments ce
       JOIN courses c ON c.id = ce.course_id
       JOIN users professor ON professor.id = c.professor_id
       LEFT JOIN assignments a ON a.course_id = c.id
       WHERE ce.student_id = $1
       GROUP BY c.id, professor.name
       ORDER BY c.created_at DESC`,
      [req.user.id],
    );
    return res.json({ courses: rows });
  }

  const isAdmin = req.user.role === 'admin';
  const { rows } = await query(
    `SELECT c.id, c.code, c.title, c.description, c.professor_id, c.created_at,
       professor.name AS professor_name,
       COUNT(DISTINCT ce.student_id)::int AS enrolled_student_count,
       COUNT(DISTINCT a.id)::int AS assignment_count,
       COUNT(DISTINCT s.id)::int AS submission_count,
       COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'acknowledged')::int
         AS acknowledgment_count
     FROM courses c
     JOIN users professor ON professor.id = c.professor_id
     LEFT JOIN course_enrollments ce ON ce.course_id = c.id
     LEFT JOIN assignments a ON a.course_id = c.id
     LEFT JOIN submissions s ON s.assignment_id = a.id
     WHERE ($1::boolean OR c.professor_id = $2)
     GROUP BY c.id, professor.name
     ORDER BY c.created_at DESC`,
    [isAdmin, req.user.id],
  );
  return res.json({ courses: rows });
}

export async function createCourse(req, res) {
  const code = requiredString(req.body?.code, 'code', { max: 40 });
  const title = requiredString(req.body?.title, 'title', { max: 200 });
  const description = optionalString(req.body?.description, 'description');
  const { rows } = await query(
    `INSERT INTO courses (code, title, description, professor_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, code, title, description, professor_id, created_at`,
    [code, title, description, req.user.id],
  );
  return res.status(201).json({ course: rows[0] });
}

export async function lookupCourseByCode(req, res) {
  const code = requiredString(req.query?.code, 'code', { max: 40 });
  const { rows } = await query(
    `SELECT c.id, c.code, c.title, c.description, professor.name AS professor_name
     FROM courses c
     JOIN users professor ON professor.id = c.professor_id
     WHERE UPPER(c.code) = UPPER($1)
     ORDER BY c.created_at DESC
     LIMIT 2`,
    [code],
  );
  if (!rows[0]) throw new HttpError(404, 'No course found with that code');
  if (rows.length > 1) {
    throw new HttpError(409, 'That course code matches multiple courses; use the course UUID instead');
  }
  return res.json({ course: rows[0] });
}

export async function enrollStudent(req, res) {
  const courseId = validUuid(req.params.courseId, 'courseId');
  const selectors = ['student_id', 'email', 'student_code']
    .filter((key) => req.body?.[key] !== undefined && req.body[key] !== null && req.body[key] !== '');
  if (selectors.length > 1) {
    throw new HttpError(400, 'Provide only one of student_id, email, or student_code');
  }

  let student;
  if (req.user.role === 'student' && selectors.length === 0) {
    const { rows } = await query(
      `SELECT id, name, email, student_code FROM users
       WHERE id = $1 AND role = 'student'`,
      [req.user.id],
    );
    student = rows[0];
  } else {
    if (selectors.length !== 1) {
      throw new HttpError(400, 'Provide student_id, email, or student_code');
    }

    const selector = selectors[0];
    let identifier = req.body[selector];
    if (selector === 'student_id') identifier = validUuid(identifier, selector);
    else identifier = requiredString(identifier, selector, { max: selector === 'email' ? 254 : 40 });

    const column = selector === 'student_id' ? 'id'
      : selector === 'email' ? 'LOWER(email)'
        : 'UPPER(student_code)';
    const value = selector === 'email' ? identifier.toLowerCase()
      : selector === 'student_code' ? identifier.toUpperCase()
        : identifier;
    const { rows } = await query(
      `SELECT id, name, email, student_code FROM users
       WHERE role = 'student' AND ${column} = $1`,
      [value],
    );
    student = rows[0];
  }

  if (!student) throw new HttpError(404, 'Student not found');
  if (req.user.role === 'student' && student.id !== req.user.id) {
    throw new HttpError(403, 'Students may only enroll themselves');
  }

  const { rows: courses } = await query(
    `SELECT id, professor_id FROM courses
     WHERE id = $1 AND ($2::boolean OR professor_id = $3)`,
    [courseId, req.user.role === 'admin' || req.user.role === 'student', req.user.id],
  );
  if (!courses[0]) {
    const { rows: existingCourses } = await query('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (!existingCourses[0]) throw new HttpError(404, 'Course not found');
    throw new HttpError(403, 'Professors may only enroll students in their own courses');
  }

  try {
    const { rows } = await query(
      `INSERT INTO course_enrollments (course_id, student_id)
       VALUES ($1, $2)
       RETURNING id, course_id, student_id, enrolled_at`,
      [courseId, student.id],
    );
    return res.status(201).json({ enrollment: rows[0], student });
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Student is already enrolled in this course');
    }
    throw error;
  }
}
