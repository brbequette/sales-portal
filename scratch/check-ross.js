const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRoss() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: 'ross', mode: 'insensitive' } },
        { name: { contains: 'heisler', mode: 'insensitive' } },
        { name: { contains: 'haisler', mode: 'insensitive' } },
        { email: { contains: 'ross', mode: 'insensitive' } },
        { email: { contains: 'heisler', mode: 'insensitive' } },
        { email: { contains: 'haisler', mode: 'insensitive' } },
      ]
    }
  });

  console.log("MATCHING USERS:", JSON.stringify(users, null, 2));

  const allUsers = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, zohoId: true }
  });
  console.log("ALL USERS IN DB:", JSON.stringify(allUsers, null, 2));

  await prisma.$disconnect();
}

checkRoss();
