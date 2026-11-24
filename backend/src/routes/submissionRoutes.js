import { Router } from 'express';
import { confirmSubmission, getAnalytics } from '../controllers/submissionController.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.post('/confirm', authorizeRoles('student'), confirmSubmission);
router.get('/analytics', authorizeRoles('admin'), getAnalytics);

export default router;
