import { Router } from 'express';
import {
  createCourse,
  enrollStudent,
  listCourses,
  lookupCourseByCode,
} from '../controllers/courseController.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/', listCourses);
router.get('/lookup', authorizeRoles('student'), lookupCourseByCode);
router.post('/', authorizeRoles('professor', 'admin'), createCourse);
router.post('/:courseId/enroll', authorizeRoles('professor', 'admin', 'student'), enrollStudent);

export default router;
