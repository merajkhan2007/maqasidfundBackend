import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const email = 'merajkhan2007@gmail.com';

    try {
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            console.log(`User with email ${email} not found. Creating as admin...`);
            // Optionally we could create, but the user requested to *make* this email admin, 
            // which implies the user might already exist, or they will register with it.
            // If it doesn't exist, we'll inform the user to register first OR we can just update our auth logic 
            // to also hardcode this email as an admin upon registration.
            return;
        }

        const updatedUser = await prisma.user.update({
            where: { email },
            data: { role: 'ADMIN' },
        });

        console.log(`Successfully updated user ${updatedUser.email} to ADMIN role.`);
    } catch (error) {
        console.error('Error updating user:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
