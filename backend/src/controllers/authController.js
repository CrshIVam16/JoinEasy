import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { requiredString } from '../utils/validation.js';

const PASSWORD_MIN_LENGTH = 8;

function assertTokenConfigured() {
  if (!process.env.JWT_SECRET) {
    throw new HttpError(500, 'Authentication is not configured');
  }
}

function createToken(user) {
  assertTokenConfigured();

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      student_code: user.student_code,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    student_code: user.student_code,
    created_at: user.created_at,
  };
}

function generateStudentCode() {
  return `STU-${randomBytes(2).toString('hex').toUpperCase()}`;
}

function validatedEmail(value) {
  const email = requiredString(value, 'email', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'email must be a valid email address');
  }
  return email;
}

function validatedPassword(value) {
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0) {
    throw new HttpError(400, 'password is required');
  }
  if (value.length > 128) {
    throw new HttpError(400, 'password must be 128 characters or fewer');
  }
  return value;
}

export async function register(req, res) {
  assertTokenConfigured();
  const name = requiredString(req.body?.name, 'name', { max: 120 });
  const email = validatedEmail(req.body?.email);
  const password = validatedPassword(req.body?.password);
  const role = req.body?.role ?? 'student';

  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new HttpError(400, `password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (!['student', 'professor', 'admin'].includes(role)) {
    throw new HttpError(400, "role must be 'student', 'professor', or 'admin'");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const studentCode = role === 'student' ? generateStudentCode() : null;

    try {
      const { rows } = await query(
        `INSERT INTO users (name, email, password_hash, role, student_code)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, role, student_code, created_at`,
        [name, email, passwordHash, role, studentCode],
      );
      const user = rows[0];
      return res.status(201).json({ token: createToken(user), user: publicUser(user) });
    } catch (error) {
      if (error.code !== '23505') throw error;

      const emailExists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
      if (emailExists.rowCount > 0) {
        throw new HttpError(409, 'An account with this email already exists');
      }
      if (role !== 'student') throw new HttpError(409, 'Unable to create account');
    }
  }

  throw new HttpError(503, 'Unable to generate a unique student code; please try again');
}

export async function login(req, res) {
  assertTokenConfigured();
  const email = validatedEmail(req.body?.email);
  const password = validatedPassword(req.body?.password);
  const { rows } = await query(
    `SELECT id, name, email, password_hash, role, student_code, created_at
     FROM users WHERE email = $1`,
    [email],
  );

  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'Invalid email or password');
  }

  return res.json({ token: createToken(user), user: publicUser(user) });
}

export function me(req, res) {
  return res.json({ user: req.user });
}
