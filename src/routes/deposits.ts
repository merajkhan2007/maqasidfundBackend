import { Router } from 'express';
import { createDeposit, getDeposits, getDepositById, updateDeposit, deleteDeposit } from '../controllers/deposits';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', createDeposit);
router.get('/', getDeposits);
router.get('/:id', getDepositById);
router.put('/:id', updateDeposit);
router.delete('/:id', deleteDeposit);

export default router;
