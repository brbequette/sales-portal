const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const legacyEnvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(legacyEnvPath)) {
  const env = fs.readFileSync(legacyEnvPath, 'utf8');
  env.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^"|"$/g, '');
      process.env[key] = val;
    }
  });
}

const ZOHO_DC = process.env.ZOHO_DC || 'com';

async function getAccessToken() {
  if (process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET) {
    try {
      const params = new URLSearchParams({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token',
      });
      const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = await res.json();
      return data.access_token;
    } catch (e) {
      console.warn(e);
    }
  }
  return process.env.ZOHO_ACCESS_TOKEN;
}

async function main() {
  try {
    const token = await getAccessToken();
    console.log('Got access token. Fetching database users...');
    
    const users = await prisma.user.findMany();
    console.log(`Loaded ${users.length} users from database.`);

    const dbInvoices = await prisma.invoice.findMany();
    const dbInvoiceMap = new Map(dbInvoices.map(i => [i.zohoId, i]));
    console.log(`Loaded ${dbInvoices.length} invoices from database.`);

    let totalUpdated = 0;

    for (const rep of users) {
      if (!rep.zohoId) continue;
      console.log(`Syncing profit for rep: ${rep.name} (Zoho ID: ${rep.zohoId})...`);
      
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const url = `https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001/search?criteria=(Owner.id:equals:${rep.zohoId})&page=${page}`;
        const res = await fetch(url, {
          headers: { Authorization: `Zoho-oauthtoken ${token}` }
        });
        
        if (!res.ok) {
          console.warn(`Search failed for rep ${rep.name} page ${page}: ${res.status}`);
          break;
        }

        const data = await res.json();
        const records = data.data || [];
        if (records.length === 0) break;

        for (const record of records) {
          const dbInvoice = dbInvoiceMap.get(record.id);
          if (dbInvoice) {
            const profit = parseFloat(record.Profit || 0);
            const deadCost = parseFloat(record.Dead_Cost_Total || 0);
            
            const currentItems = dbInvoice.items || {};
            const updatedItems = {
              ...currentItems,
              profit,
              deadCostTotal: deadCost
            };
            
            await prisma.invoice.update({
              where: { id: dbInvoice.id },
              data: {
                items: updatedItems
              }
            });
            totalUpdated++;
          }
        }
        
        hasMore = data.info?.more_records || false;
        page++;
      }
    }

    console.log(`Backfill complete! Updated profit & dead cost for ${totalUpdated} invoices in the database.`);

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
