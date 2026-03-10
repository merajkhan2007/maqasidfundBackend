import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { z } from 'zod';

const registerSchema = z.object({
    name: z.string().min(2),
    mobile: z.string().min(10),
    email: z.string().email(),
    password: z.string().min(6),
    address: z.string().optional(),
    monthlyAmount: z.number().min(0).optional(),
});

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = registerSchema.parse(req.body);

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

        const userCount = await prisma.user.count();
        let assignedRole: 'ADMIN' | 'MEMBER' = userCount === 0 ? 'ADMIN' : 'MEMBER';

        // Ensure specific email is always an admin
        if (data.email === 'merajkhan2007@gmail.com') {
            assignedRole = 'ADMIN';
        }

        const user = await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                mobile: data.mobile,
                password: hashedPassword,
                address: data.address,
                monthlyAmount: data.monthlyAmount || 0,
                role: assignedRole
            }
        });

        res.status(201).json({ message: 'User registered successfully', userId: user.id });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string()
});

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = loginSchema.parse(req.body);

        const user = await prisma.user.findUnique({
            where: { email: data.email }
        });

        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const validPassword = await bcrypt.compare(data.password, user.password);
        if (!validPassword) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        if (user.status !== 'ACTIVE') {
            res.status(403).json({ error: 'Account is inactive' });
            return;
        }

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

import crypto from 'crypto';
import nodemailer from 'nodemailer';

const forgotPasswordSchema = z.object({
    email: z.string().email(),
});

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = forgotPasswordSchema.parse(req.body);

        const user = await prisma.user.findUnique({
            where: { email: data.email }
        });

        if (!user) {
            // Standard security practice: don't reveal if email exists or not
            res.json({ message: 'If that email is registered, a reset link has been sent.' });
            return;
        }

        // Generate a random token
        const resetToken = crypto.randomBytes(32).toString('hex');

        // Hash it before storing in DB for security
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        // Token expires in 1 hour
        const tokenExpiration = new Date(Date.now() + 60 * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken: hashedToken,
                resetPasswordExpires: tokenExpiration,
            }
        });

        const resetUrl = `http://localhost:3000/reset-password?token=${resetToken}`;
        const message = `You requested a password reset. Please go to this link to reset your password: \n\n ${resetUrl} \n\n This link will expire in 1 hour.`;

        // Since we might not have real SMTP credentials available, we print it to console.
        console.log("---- SECURE PASSWORD RESET LINK ----");
        console.log(resetUrl);
        console.log("------------------------------------");

        try {
            // Attempt to use nodemailer if ENV vars are provided (Optional feature)
            if (process.env.SMTP_HOST && process.env.SMTP_USER) {
                const transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: Number(process.env.SMTP_PORT) || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS,
                    },
                });

                await transporter.sendMail({
                    from: '"MAQASIDFund Admin" <no-reply@maqasidfund.com>',
                    to: user.email,
                    subject: 'Password Reset Request',
                    text: message,
                });
            }
        } catch (mailError) {
            console.error("Failed to send email. The link was still generated in the console.", mailError);
        }

        res.json({ message: 'If that email is registered, a reset link has been sent.' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

const resetPasswordSchema = z.object({
    token: z.string(),
    password: z.string().min(6),
});

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = resetPasswordSchema.parse(req.body);

        // Hash the token provided by the user to compare with the DB
        const hashedToken = crypto.createHash('sha256').update(data.token).digest('hex');

        const user = await prisma.user.findFirst({
            where: {
                resetPasswordToken: hashedToken,
                resetPasswordExpires: { gt: new Date() }, // Token must not be expired
            }
        });

        if (!user) {
            res.status(400).json({ error: 'Invalid or expired password reset token' });
            return;
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        // Update the password and clear the reset token fields
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpires: null,
            }
        });

        res.json({ message: 'Password has been successfully updated. You can now log in.' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
            return;
        }
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
