const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

const legacyEnvPath = path.join(__dirname, '..', '..', '.env');
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
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "846879854";

async function getAccessToken() {
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
}

async function main() {
  try {
    const token = await getAccessToken();
    console.log("Token acquired.");
    
    let page = 1;
    let hasMore = true;
    let totalUpdated = 0;
    
    while (hasMore) {
      console.log(`Fetching page ${page} of paid invoices from Zoho Books...`);
      const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices?organization_id=${ORG_ID}&status=paid&per_page=200&page=${page}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });
      const data = await res.json();
      
      if (data.code !== 0 || !data.invoices || data.invoices.length === 0) {
        console.log("No more invoices or error:", data);
        break;
      }
      
      const updateOps = [];
      for (const booksInv of data.invoices) {
        // Find local invoice
        const localInvoice = await prisma.invoice.findFirst({
          where: {
            OR: [
              {
                items: {
                  path: ['booksInvoiceId'],
                  equals: booksInv.invoice_id
                }
              },
              {
                items: {
                  path: ['invoiceNumber'],
                  equals: booksInv.invoice_number
                }
              }
            ]
          }
        });
        
        if (localInvoice) {
          const currentItems = localInvoice.items || {};
          const currentPaymentDate = currentItems.paymentDate;
          
          let paymentDate = booksInv.last_payment_date || booksInv.date;
          
          if (currentPaymentDate !== paymentDate || localInvoice.status !== 'Paid') {
            currentItems.paymentDate = paymentDate;
            currentItems.balance = 0;
            
            updateOps.push(
              prisma.invoice.update({
                where: { id: localInvoice.id },
                data: {
                  status: 'Paid',
                  items: currentItems
                }
              })
            );
          }
        }
      }
      
      if (updateOps.length > 0) {
        await prisma.$transaction(updateOps);
        totalUpdated += updateOps.length;
        console.log(`Updated ${updateOps.length} invoices in page ${page}. Total updated: ${totalUpdated}`);
      }
      
      hasMore = data.page_context?.has_more_page || false;
      page++;
    }
    
    console.log(`Backfill completed! Total invoices updated with correct payment dates: ${totalUpdated}`);
  } catch (error) {
    console.error("Error running backfill:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
