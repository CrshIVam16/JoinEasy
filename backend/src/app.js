import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import assignmentRoutes from './routes/assignmentRoutes.js';
import submissionRoutes from './routes/submissionRoutes.js';
import { HttpError } from './utils/httpError.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);

app.use((req, res, next) => {
  next(new HttpError(404, 'Route not found'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Request body contains invalid JSON' });
  }

  if (error.code === '23505') {
    return res.status(409).json({ error: 'A record with the provided details already exists' });
  }
  if (error.code === '23503') {
    return res.status(400).json({ error: 'A referenced record does not exist' });
  }

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : 500;
  if (status === 500) console.error('Unhandled request error:', error);
  return res.status(status).json({
    error: status === 500 ? 'An unexpected server error occurred' : error.message,
  });
});

export default app;
