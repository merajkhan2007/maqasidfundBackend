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

        // Hard delete or soft delete? We'll use soft delete by making INACTIVE
        await prisma.user.update({
            where: { id: Number(id) },
            data: { status: 'INACTIVE' }
        });

        res.json({ message: 'Member deactivated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
