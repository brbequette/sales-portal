const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const invs = await prisma.invoice.findMany({ where: { items: { string_contains: '8189' } } });
  console.log(invs.map(i => ({ id: i.id, zohoId: i.zohoId })));
})();
