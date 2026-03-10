const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: { password: hashedPassword, role: 'ADMIN' },
    create: {
      name: 'Test Admin',
      email: 'admin@test.com',
      mobile: '1234567890',
      password: hashedPassword,
      role: 'ADMIN',
      status: 'ACTIVE'
    }
  });
  
  const member = await prisma.user.upsert({
    where: { email: 'member@test.com' },
    update: { password: hashedPassword, role: 'MEMBER' },
    create: {
      name: 'Test Member',
      email: 'member@test.com',
      mobile: '0987654321',
      password: hashedPassword,
      role: 'MEMBER',
      status: 'ACTIVE',
      monthlyAmount: 500
    }
  });

  console.log('Created admin:', admin.email);
  console.log('Created member:', member.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
