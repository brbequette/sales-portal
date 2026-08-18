const { PrismaClient } = require('@prisma/client');
async function run() {
  const prisma = new PrismaClient();
  const models = ['invoice', 'quote', 'salesOrder'];
  
  for (const m of models) {
    const all = await prisma[m].findMany({ select: { id: true, zohoId: true } });
    const badIds = all.filter(r => !/^\d{15,20}$/.test(String(r.zohoId))).map(r => r.id);
    
    if (badIds.length > 0) {
      const res = await prisma[m].deleteMany({ where: { id: { in: badIds } } });
      console.log(`Deleted ${res.count} bad ${m}s`);
    } else {
      console.log(`No bad ${m}s`);
    }
  }
}
run();
