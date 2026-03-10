import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const applyLoanSchema = z.object({
    requestedAmount: z.number().min(1),
    reason: z.string().optional(),
    requestedDuration: z.number().min(1), // in months
});

export const applyLoan = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = applyLoanSchema.parse(req.body);

        // Check if user already has an active loan?
        // We can allow multiple pending, but maybe only one active. For now, let's keep it simple.

        const loan = await prisma.loan.create({
            data: {
                userId: req.user!.id,
                requestedAmount: data.requestedAmount,
                reason: data.reason,
                requestedDuration: data.requestedDuration,
                status: 'PENDING'
            }
        });

        res.status(201).json(loan);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: (error as z.ZodError).issues });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const getLoans = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        let whereClause = {};
        if (req.user?.role !== 'ADMIN') {
            whereClause = { userId: req.user?.id };
        }

        const loans = await prisma.loan.findMany({
            where: whereClause,
            include: {
                user: { select: { name: true, email: true } },
                payments: true
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(loans);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const getLoanById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const loan = await prisma.loan.findUnique({
            where: { id: Number(id) },
            include: {
                payments: true
            }
        });

        if (!loan) {
            res.status(404).json({ error: 'Loan not found' });
            return;
        }

        if (req.user?.role !== 'ADMIN' && loan.userId !== req.user?.id) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        res.json(loan);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

const updateLoanSchema = z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PAID_OFF']),
    requestedAmount: z.number().optional(),
    approvedAmount: z.number().optional(),
    interestRate: z.number().optional(),
    emi: z.number().optional(),
    remainingBalance: z.number().optional(),
    createdAt: z.string().optional(),
});

export const updateLoan = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const data = updateLoanSchema.parse(req.body);

        if (req.user?.role !== 'ADMIN') {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        const loan = await prisma.loan.findUnique({ where: { id: Number(id) } });

        if (!loan) {
            res.status(404).json({ error: 'Loan not found' });
            return;
        }

        // Calculate new remaining balance logic
        let newRemainingBalance = data.remainingBalance;

        if (data.status === 'APPROVED') {
            // Admin just approved or is editing an already approved loan
            if (data.approvedAmount !== undefined && loan.status === 'APPROVED') {
                // Changing the loan amount AFTER it was already approved
                // We add the difference between new and old approvedAmount to the current balance
                const diff = data.approvedAmount - (loan.approvedAmount || loan.requestedAmount);
                newRemainingBalance = (loan.remainingBalance || 0) + diff;
            } else if (!loan.remainingBalance) {
                // First time approving
                newRemainingBalance = (data.approvedAmount || loan.requestedAmount) + ((data.approvedAmount || loan.requestedAmount) * (data.interestRate || 0) / 100);
            }
        }

        const updatedLoan = await prisma.loan.update({
            where: { id: Number(id) },
            data: {
                ...data,
                ...(data.createdAt ? { createdAt: new Date(data.createdAt) } : {}), // Override createdAt if provided
                remainingBalance: newRemainingBalance,
                ...(data.status === 'APPROVED' && loan.status !== 'APPROVED' ? { approvedAt: new Date() } : {})
            }
        });

        res.json(updatedLoan);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: (error as z.ZodError).issues });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const deleteLoan = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        if (req.user?.role !== 'ADMIN') {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        const loan = await prisma.loan.findUnique({ where: { id: Number(id) } });

        if (!loan) {
            res.status(404).json({ error: 'Loan not found' });
            return;
        }

        // Delete associated payments first (if no cascade isn't strictly set on Prisma model)
        await prisma.loanPayment.deleteMany({
            where: { loanId: Number(id) }
        });

        // Delete the loan
        await prisma.loan.delete({
            where: { id: Number(id) }
        });

        res.json({ message: 'Loan deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

const recordLoanPaymentSchema = z.object({
    amount: z.number().min(1),
    transactionId: z.string().optional(),
    date: z.string().optional(),
});

export const recordLoanPayment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const data = recordLoanPaymentSchema.parse(req.body);

        if (req.user?.role !== 'ADMIN') {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        const loan = await prisma.loan.findUnique({ where: { id: Number(id) } });

        if (!loan) {
            res.status(404).json({ error: 'Loan not found' });
            return;
        }

        if (loan.status !== 'APPROVED') {
            res.status(400).json({ error: 'Loan is not active' });
            return;
        }

        // 1. Create the payment record
        const paymentDate = data.date ? new Date(data.date) : new Date();
        const payment = await prisma.loanPayment.create({
            data: {
                loanId: loan.id,
                amount: data.amount,
                dueDate: paymentDate, // Simple use of actual payment date as due date for now
                paidDate: paymentDate,
                status: 'PAID',
                transactionId: data.transactionId
            }
        });

        // 2. Decrement remaining balance
        const currentBalance = loan.remainingBalance || 0;
        const newBalance = Math.max(0, currentBalance - data.amount);

        const updatedLoan = await prisma.loan.update({
            where: { id: loan.id },
            data: {
                remainingBalance: newBalance,
                status: newBalance === 0 ? 'PAID_OFF' : 'APPROVED' // Auto close if fully paid
            }
        });

        res.json({ payment, loan: updatedLoan });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: (error as z.ZodError).issues });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
