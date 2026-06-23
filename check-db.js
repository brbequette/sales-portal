const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const setting = await prisma.systemSetting.findUnique({where: {key: 'zoho_phone_numbers'}});
  console.log(setting);
}

main().finally(() => prisma.$disconnect());
