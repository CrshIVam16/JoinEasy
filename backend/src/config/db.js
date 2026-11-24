import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const useSsl = Boolean(
  process.env.DATABASE_URL?.includes('neon.tech') ||
    process.env.NODE_ENV === 'production',
);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const query = (text, params) => pool.query(text, params);

export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Database transaction rollback failed:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}
