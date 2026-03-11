import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    console.log("Connecting to database...");
    const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, status: true } });
    console.log("Users in DB:", users);
}
main()
    .catch(e => {
        console.error("Error:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
