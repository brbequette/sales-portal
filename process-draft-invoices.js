const fs = require('fs');
const path = require('path');

// Load env variables from local and parent path
function loadEnv(filePath) {
  if (fs.existsSync(filePath)) {
    const env = fs.readFileSync(filePath, 'utf8');
    env.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^"|"$/g, '');
        process.env[key] = val;
      }
    });
  }
}
loadEnv(path.join(__dirname, '.env'));
loadEnv(path.join(__dirname, '..', '.env'));

const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

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
      console.warn("Failed to refresh token via OAuth:", e.message);
    }
  }
  return process.env.ZOHO_ACCESS_TOKEN;
}

async function main() {
  try {
    const token = await getAccessToken();
    if (!token) {
      console.error("Error: Could not retrieve Zoho access token.");
      process.exit(1);
    }

    console.log("Fetching draft invoices from Zoho Books...");
    
    let page = 1;
    let allDraftInvoices = [];
    let hasMore = true;

    while (hasMore) {
      const listRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices?organization_id=${ORG_ID}&status=draft&page=${page}&per_page=200`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });
      
      if (!listRes.ok) {
        const errText = await listRes.text();
        console.error(`Error fetching invoices from Zoho Books: ${listRes.status} - ${errText}`);
        break;
      }

      const listData = await listRes.ok ? await listRes.json() : {};
      const invoices = listData.invoices || [];
      
      if (invoices.length === 0) {
        break;
      }

      allDraftInvoices = allDraftInvoices.concat(invoices);
      
      const pageContext = listData.page_context || {};
      hasMore = pageContext.has_more_page || false;
      page++;
    }

    console.log(`Found ${allDraftInvoices.length} draft invoices.`);

    if (allDraftInvoices.length === 0) {
      console.log("No draft invoices to process.");
      return;
    }

    // Helper for throttling
    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    // Process each draft invoice
    for (const inv of allDraftInvoices) {
      console.log(`Processing invoice #${inv.invoice_number} (ID: ${inv.invoice_id}, Customer: ${inv.customer_name}, Total: $${inv.total})...`);
      
      const updateRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${inv.invoice_id}/status/sent?organization_id=${ORG_ID}`, {
        method: 'POST',
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });

      if (updateRes.ok) {
        const updateData = await updateRes.json();
        console.log(`Successfully updated status to "Sent" for Invoice #${inv.invoice_number}. Message: ${updateData.message || 'Success'}`);
      } else {
        const errText = await updateRes.text();
        console.error(`Failed to update status for Invoice #${inv.invoice_number}: ${updateRes.status} - ${errText}`);
      }
      
      await delay(300);
    }

    console.log("\nAll draft invoices processed.");
  } catch (error) {
    console.error("Main execution error:", error);
  }
}

main();
