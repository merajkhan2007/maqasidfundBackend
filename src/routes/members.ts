import { Router } from 'express';
import { getMembers, getMemberById, updateMember, deleteMember, createMember } from '../controllers/members';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// All member routes require authentication
router.use(authenticate);

// Admin only to get all members list (or we can let members see each other, up to business logic)
// Based on "Admin Dashboard: Add / edit / delete members", let's protect the global list for members
// But members might need to see some data? We'll restrict to Admin for now.
router.get('/', requireAdmin, getMembers);
router.post('/', requireAdmin, createMember);
router.get('/:id', getMemberById);
router.put('/:id', updateMember);
router.delete('/:id', requireAdmin, deleteMember);

export default router;
