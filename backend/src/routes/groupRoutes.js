import { Router } from 'express';
import {
  addMember,
  createGroup,
  listAllGroups,
  listMyGroups,
  removeMember,
  transferLeadership,
} from '../controllers/groupController.js';
import { authenticate, authorizeRoles } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.post('/', authorizeRoles('student'), createGroup);
router.get('/my', authorizeRoles('student'), listMyGroups);
router.get('/', authorizeRoles('professor', 'admin'), listAllGroups);
router.post('/:groupId/members', authorizeRoles('student'), addMember);
router.patch('/:groupId/leader', authorizeRoles('student'), transferLeadership);
router.delete('/:groupId/members/:userId', authorizeRoles('student'), removeMember);

export default router;
