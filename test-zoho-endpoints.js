require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tokenSetting = await prisma.systemSetting.findUnique({ where: { key: 'zoho_access_token' } });
  const token = tokenSetting ? tokenSetting.value : null;

  const endpoints = [
    'https://voice.zoho.com/rest/json/v1/numbers',
    'https://voice.zoho.com/api/v1/numbers',
    'https://voice.zoho.com/api/v1/settings/numbers'
  ];

  for (const url of endpoints) {
    console.log("Testing:", url);
    const res = await fetch(url, {
      headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
    });
    console.log("Status:", res.status, await res.text());
  }
}
main().finally(() => prisma.$disconnect());
