const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.account.findFirst({ include: { contacts: true } })
  .then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch(console.error);
