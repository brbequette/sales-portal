import { prisma } from '../src/lib/prisma';
import { getZohoAccessToken } from '../src/lib/zoho-auth';

async function main() {
  const token = await getZohoAccessToken();
  console.log('Got Zoho Access Token:', token.substring(0, 15) + '...');

  const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';
  const url = `https://www.zohoapis.com/books/v3/packages?organization_id=${ORG_ID}&page=1&per_page=10`;

  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });

  const data = await res.json();
  console.log('Packages response code:', data.code, 'message:', data.message);
  console.log('Sample package:', data.packages?.[0]);

  process.exit(0);
}

main().catch(console.error);
