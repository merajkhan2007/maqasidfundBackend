import { Router } from 'express';
import { getCollectionReport, getLoanReport } from '../controllers/reports';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/collections', getCollectionReport);
router.get('/loans', getLoanReport);

export default router;
