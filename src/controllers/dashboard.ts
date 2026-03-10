import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const getDashboardData = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (req.user?.role === 'ADMIN') {
            // Admin Dashboard Data
            const membersCount = await prisma.user.count({ where: { role: 'MEMBER' } });

            const deposits = await prisma.deposit.aggregate({
                where: { status: 'PAID' },
                _sum: { amount: true }
            });

            const activeLoans = await prisma.loan.aggregate({
                where: { status: 'APPROVED' },
                _sum: { remainingBalance: true }
            });

            const pendingPayments = await prisma.deposit.count({
                where: { status: 'PENDING' }
            });

            const totalDeposits = deposits._sum.amount || 0;
            const totalActiveLoans = activeLoans._sum.remainingBalance || 0;
            const totalFund = totalDeposits - totalActiveLoans;

            // TODO: Monthly Growth Chart
            // Grouping by month can be done directly by Prisma with raw queries or client side format

            res.json({
                totalMembers: membersCount,
                totalDeposits,
                activeLoansCount: await prisma.loan.count({ where: { status: 'APPROVED' } }),
                totalActiveLoans,
                totalFund,
                pendingPayments
            });
        } else {
            // Member Dashboard Data
            const userId = req.user?.id;

            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { name: true, monthlyAmount: true }
            });

            const userDeposits = await prisma.deposit.aggregate({
                where: { userId, status: 'PAID' },
                _sum: { amount: true }
            });

            const activeLoans = await prisma.loan.findMany({
                where: { userId, status: { in: ['PENDING', 'APPROVED', 'PAID_OFF'] } },
                include: { payments: true }
            });

            const nextPayment = await prisma.loanPayment.findFirst({
                where: { loan: { userId }, status: 'PENDING' },
                orderBy: { dueDate: 'asc' }
            });

            res.json({
                totalDepositedAmount: userDeposits._sum.amount || 0,
                activeLoans,
                upcomingPayment: nextPayment || null,
                monthlyAmount: user?.monthlyAmount || 0,
                userName: user?.name || ''
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
