import jwt from 'jsonwebtoken';
import { HttpError } from '../utils/httpError.js';

export function authenticate(req, res, next) {
  const authorization = req.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';

  if (!token) {
    return next(new HttpError(401, 'Authentication token is required'));
  }
  if (!process.env.JWT_SECRET) {
    return next(new HttpError(500, 'Authentication is not configured'));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (
      typeof payload !== 'object' ||
      typeof payload.id !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.name !== 'string' ||
      !['student', 'admin'].includes(payload.role)
    ) {
      throw new HttpError(401, 'Invalid authentication token');
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      name: payload.name,
      student_code: payload.student_code ?? null,
    };
    return next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    return next(new HttpError(401, 'Invalid or expired authentication token'));
  }
}

export function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Authentication is required'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have permission to perform this action'));
    }
    return next();
  };
}
