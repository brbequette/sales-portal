require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ZOHO_DC = process.env.ZOHO_DC || 'com';

async function main() {
  const tokenSetting = await prisma.systemSetting.findUnique({ where: { key: 'zoho_access_token' } });
  const token = tokenSetting ? tokenSetting.value : null;
  
  if (!token) return console.error("No token available in DB");

  const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
