const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const configs = await prisma.systemSetting.findMany();
  console.log(configs.map(c => c.key));
  const zohoconfig = await prisma.systemSetting.findUnique({ where: { key: 'zoho_oauth' } });
  console.log(zohoconfig ? 'Found zoho_oauth' : 'NOT FOUND zoho_oauth');
}

main().catch(console.error).finally(() => prisma.$disconnect());
