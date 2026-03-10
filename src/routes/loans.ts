import { Router } from 'express';
import { applyLoan, getLoans, getLoanById, updateLoan, recordLoanPayment, deleteLoan } from '../controllers/loans';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', applyLoan);
router.get('/', getLoans);
router.get('/:id', getLoanById);
router.put('/:id', updateLoan);
router.delete('/:id', deleteLoan);
router.post('/:id/payments', recordLoanPayment);

export default router;
