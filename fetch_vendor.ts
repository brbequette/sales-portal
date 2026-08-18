import { getZohoAccessToken } from './netlify/functions/lib/zoho-auth';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  try {
    const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';
    const token = await getZohoAccessToken();
    
    const res = await fetch(`https://www.zohoapis.com/books/v3/contacts?organization_id=${ORG_ID}&contact_type=vendor`, {
      headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
    });
    
    const data = await res.json();
    console.log(JSON.stringify(data.contacts?.[0] || data, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
