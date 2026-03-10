import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const getCollectionReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (req.user?.role !== 'ADMIN') {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        const { month } = req.query; // optional filter

        let whereClause = {};
        if (month) {
            whereClause = { month: String(month) };
        }

        const collections = await prisma.deposit.findMany({
            where: whereClause,
            include: {
                user: { select: { name: true, mobile: true } }
            },
            orderBy: { date: 'desc' }
        });

        res.json(collections);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const getLoanReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (req.user?.role !== 'ADMIN') {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        const loans = await prisma.loan.findMany({
            include: {
                user: { select: { name: true, mobile: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(loans);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
