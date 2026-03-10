import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const createDepositSchema = z.object({
    userId: z.number().optional(), // Members won't send this, but Admin can
    month: z.string(),
    amount: z.number(),
    paymentMethod: z.string().optional(),
    transactionId: z.string().optional(),
    notes: z.string().optional(),
    date: z.string().optional(), // ISO string
});

export const createDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = createDepositSchema.parse(req.body);

        // Determine the userId for the deposit
        let targetUserId = req.user?.id;
        if (req.user?.role === 'ADMIN' && data.userId) {
            targetUserId = data.userId;
        }

        // Check for duplicate deposit for same user and month
        const existingDeposit = await prisma.deposit.findFirst({
            where: {
                userId: targetUserId,
                month: data.month,
            }
        });

        if (existingDeposit) {
            res.status(400).json({ error: 'A deposit for this month has already been recorded for this member.' });
            return;
        }

        const deposit = await prisma.deposit.create({
            data: {
                userId: targetUserId,
                month: data.month,
                amount: data.amount,
                paymentMethod: data.paymentMethod,
                transactionId: data.transactionId,
                notes: data.notes,
                date: data.date ? new Date(data.date) : new Date(),
                // Members submit as PENDING, Admin can directly set PAID?
                // Wait, members submit as PENDING by default
                status: req.user?.role === 'ADMIN' ? 'PAID' : 'PENDING',
            }
        });

        res.status(201).json(deposit);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.issues });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const getDeposits = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        let whereClause = {};

        if (req.user?.role !== 'ADMIN') {
            whereClause = { userId: req.user?.id };
        } else if (req.query.userId) {
            whereClause = { userId: Number(req.query.userId) };
        }

        const deposits = await prisma.deposit.findMany({
            where: whereClause,
            include: {
                user: { select: { name: true, email: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(deposits);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const getDepositById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const deposit = await prisma.deposit.findUnique({
            where: { id: Number(id) }
        });

        if (!deposit) {
            res.status(404).json({ error: 'Deposit not found' });
            return;
        }

        if (req.user?.role !== 'ADMIN' && deposit.userId !== req.user?.id) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        res.json(deposit);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

const updateDepositSchema = z.object({
    month: z.string().optional(),
    status: z.enum(['PAID', 'PENDING', 'LATE']).optional(),
    amount: z.number().optional(),
    paymentMethod: z.string().nullish(),
    transactionId: z.string().nullish(),
    notes: z.string().nullish(),
});

export const updateDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const data = updateDepositSchema.parse(req.body);

        const deposit = await prisma.deposit.findUnique({ where: { id: Number(id) } });

        if (!deposit) {
            res.status(404).json({ error: 'Deposit not found' });
            return;
        }

        if (req.user?.role !== 'ADMIN' && deposit.userId !== req.user?.id) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        // Only Admin can update status and month
        if (req.user?.role !== 'ADMIN') {
            delete data.status;
            delete data.month;
            delete data.amount; // Prevent users from modifying amount after submission, unless logic dictates otherwise
        }

        // Check for duplicate if updating month
        if (data.month && data.month !== deposit.month) {
            const existingDeposit = await prisma.deposit.findFirst({
                where: {
                    userId: deposit.userId,
                    month: data.month,
                }
            });

            if (existingDeposit) {
                res.status(400).json({ error: 'A deposit for this month has already been recorded for this member.' });
                return;
            }
        }

        const updatedDeposit = await prisma.deposit.update({
            where: { id: Number(id) },
            data,
        });

        res.json(updatedDeposit);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.issues });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const deleteDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        if (req.user?.role !== 'ADMIN') {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        const deposit = await prisma.deposit.findUnique({ where: { id: Number(id) } });

        if (!deposit) {
            res.status(404).json({ error: 'Deposit not found' });
            return;
        }

        await prisma.deposit.delete({
            where: { id: Number(id) }
        });

        res.json({ message: 'Deposit deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
