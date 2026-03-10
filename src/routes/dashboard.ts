import { Router } from 'express';
import { getDashboardData } from '../controllers/dashboard';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', getDashboardData);

export default router;
