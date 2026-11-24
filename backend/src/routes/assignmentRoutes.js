import { Router } from 'express';
import {
  createAssignment,
  deleteAssignment,
  listAssignments,
  updateAssignment,
} from '../controllers/assignmentController.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.get('/', listAssignments);
router.post('/', authorizeRoles('admin'), createAssignment);
router.put('/:id', authorizeRoles('admin'), updateAssignment);
router.delete('/:id', authorizeRoles('admin'), deleteAssignment);

export default router;
