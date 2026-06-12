const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const config = await prisma.systemSetting.findUnique({ where: { key: 'zoho_access_token' } });
  if (!config) throw new Error('No config');
  
  const token = typeof config.value === 'string' ? config.value : (config.value.access_token || config.value);
  const ZOHO_DC = 'com';
  
  const invoiceRes = await fetch(
    `https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001/6821836000005169158`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  
  if (!invoiceRes.ok) {
    console.error(await invoiceRes.text());
    return;
  }
  
  const data = await invoiceRes.json();
  console.log(JSON.stringify(data.data[0], null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
