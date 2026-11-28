import { Router } from 'express';
import {
  acknowledgeSubmission,
  confirmSubmission,
  getAnalytics,
} from '../controllers/submissionController.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.post('/confirm', authorizeRoles('student'), confirmSubmission);
router.post('/acknowledge', authorizeRoles('student'), acknowledgeSubmission);
router.get('/analytics', authorizeRoles('professor', 'admin'), getAnalytics);

export default router;
