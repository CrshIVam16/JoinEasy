import { HttpError } from './httpError.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requiredString(value, field, { max = 500 } = {}) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${field} is required`);
  }

  const normalized = value.trim();
  if (normalized.length > max) {
    throw new HttpError(400, `${field} must be ${max} characters or fewer`);
  }

  return normalized;
}

export function optionalString(value, field, { max = 2000 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) {
    throw new HttpError(400, `${field} must be a string of ${max} characters or fewer`);
  }
  return value.trim();
}

export function validUuid(value, field) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new HttpError(400, `${field} must be a valid UUID`);
  }
  return value;
}

export function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, `${field} must be a valid date`);
  }
  return new Date(value).toISOString();
}

export function optionalUrl(value, field) {
  const normalized = optionalString(value, field, { max: 2048 });
  if (normalized === null) return null;

  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
  } catch {
    throw new HttpError(400, `${field} must be a valid HTTP or HTTPS URL`);
  }

  return normalized;
}

export function groupIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'group_ids must be an array');
  }

  const ids = value.map((id) => validUuid(id, 'group_ids entry'));
  if (new Set(ids).size !== ids.length) {
    throw new HttpError(400, 'group_ids must not contain duplicates');
  }
  return ids;
}
