import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const createMemberSchema = z.object({
    name: z.string().min(2),
    mobile: z.string().min(10),
    email: z.string().email(),
    password: z.string().min(6),
    address: z.string().optional(),
    monthlyAmount: z.number().min(0).optional(),
    role: z.enum(['ADMIN', 'MEMBER']).optional().default('MEMBER'),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE')
});

export const createMember = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data = createMemberSchema.parse(req.body);

        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: data.email },
                    { mobile: data.mobile }
                ]
            }
        });

        if (existingUser) {
            res.status(400).json({ error: 'Email or mobile already registered' });
            return;
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        const user = await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                mobile: data.mobile,
                password: hashedPassword,
                address: data.address,
                monthlyAmount: data.monthlyAmount || 0,
                role: data.role,
                status: data.status,
            }
        });

        res.status(201).json({ message: 'User created successfully', userId: user.id });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.issues });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const getMembers = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const members = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                mobile: true,
                address: true,
                monthlyAmount: true,
                joinDate: true,
                status: true,
                role: true,
            },
            orderBy: { joinDate: 'desc' },
        });
        res.json(members);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const getMemberById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Users can only view their own profile, unless they are ADMIN
        if (req.user?.role !== 'ADMIN' && req.user?.id !== Number(id)) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        const member = await prisma.user.findUnique({
            where: { id: Number(id) },
            select: {
                id: true, name: true, email: true, mobile: true,
                address: true, monthlyAmount: true, joinDate: true,
                status: true, role: true, idProofUrl: true
            }
        });

        if (!member) {
            res.status(404).json({ error: 'Member not found' });
            return;
        }

        const deposits = await prisma.deposit.aggregate({
            where: { userId: Number(id), status: 'PAID' },
            _sum: { amount: true }
        });

        res.json({
            ...member,
            totalDeposits: deposits._sum.amount || 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

const updateMemberSchema = z.object({
    name: z.string().optional(),
    mobile: z.string().optional(),
    address: z.string().optional(),
    monthlyAmount: z.number().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    role: z.enum(['ADMIN', 'MEMBER']).optional(),
});

export const updateMember = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const data = updateMemberSchema.parse(req.body);

        if (req.user?.role !== 'ADMIN' && req.user?.id !== Number(id)) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        // Only admins can update status and role
        if (req.user?.role !== 'ADMIN') {
            delete data.status;
            delete data.role;
        }

        const updatedUser = await prisma.user.update({
            where: { id: Number(id) },
            data,
            select: {
                id: true, name: true, email: true, mobile: true,
                status: true, role: true, monthlyAmount: true
            }
        });

        res.json(updatedUser);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.issues });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const deleteMember = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const userId = Number(id);

        if (isNaN(userId)) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }

        // Check if the user trying to be deleted is an admin, and prevent accidental self-deletion
        const userToDelete = await prisma.user.findUnique({
             where: { id: userId },
             select: { role: true }
        });

        if (!userToDelete) {
             res.status(404).json({ error: 'User not found' });
             return;
        }

        if (userToDelete.role === 'ADMIN' && req.user?.id === userId) {
            res.status(400).json({ error: 'Cannot delete your own admin account.' });
            return;
        }

        // Use a transaction to safely delete all related records
        await prisma.$transaction(async (tx) => {
            // 1. Delete Notifications
            await tx.notification.deleteMany({
                where: { userId }
            });

            // 2. Delete Deposits
            await tx.deposit.deleteMany({
                where: { userId }
            });

            // 3. Delete LoanPayments (need to find loans first)
            const userLoans = await tx.loan.findMany({
                where: { userId },
                select: { id: true }
            });
            const loanIds = userLoans.map(l => l.id);

            if (loanIds.length > 0) {
                 await tx.loanPayment.deleteMany({
                      where: { loanId: { in: loanIds } }
                 });
            }

            // 4. Delete Loans
            await tx.loan.deleteMany({
                where: { userId }
            });

            // 5. Finally, delete User
            await tx.user.delete({
                where: { id: userId }
            });
        });

        res.json({ message: 'Member permanently deleted' });
    } catch (error) {
        console.error('Error deleting member:', error);
        res.status(500).json({ error: 'Failed to delete member' });
    }
};
