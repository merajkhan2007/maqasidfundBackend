// removed axios
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

async function testApi() {
    try {
        // 1. Get the admin user
        const admin = await prisma.user.findUnique({
            where: { email: 'merajkhan2007@gmail.com' }
        });

        if (!admin) {
            console.log("Admin not found!");
            return;
        }

        // 2. Generate a token like the auth controller does
        const token = jwt.sign(
            { userId: admin.id, role: admin.role },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );

        console.log("Token generated:", token);

        // 3. Make the API request exactly like the frontend
        const res = await fetch('http://localhost:5000/api/deposits', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: admin.id, // Test with admin ID
                month: 'October 2026',
                amount: 5000,
                paymentMethod: 'Manual/Cash',
                notes: ''
            })
        });

        if (!res.ok) {
            console.error("API Error Response:", res.status, await res.text());
            return;
        }

        console.log("SUCCESS!", await res.json());
    } catch (error: any) {
        console.error("API Error Response:", error.response?.status, error.response?.data);
        console.error(error.message);
    }
}

testApi();
