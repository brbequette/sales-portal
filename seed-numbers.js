require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const numbers = [{
    name: 'Default SMS Line', 
    number: process.env.ZOHO_VOICE_FROM_NUMBER || '+14804702577', 
    isDefault: true
  }];
  
  await prisma.systemSetting.upsert({
    where: { key: 'zoho_phone_numbers' },
    update: { value: JSON.stringify(numbers) },
    create: { key: 'zoho_phone_numbers', value: JSON.stringify(numbers) }
  });
  
  console.log('Seeded zoho_phone_numbers');
}

main().finally(() => prisma.$disconnect());
