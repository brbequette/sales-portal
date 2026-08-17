const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
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
      console.warn(e);
    }
  }
  return process.env.ZOHO_ACCESS_TOKEN;
}

async function main() {
  try {
    const token = await getAccessToken();
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`;

    console.log("Listing contacts from Zoho Books...");
    const res = await fetch(`${baseUrl}/contacts?per_page=200&organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    const data = await res.json();
    const contacts = data.contacts || [];
    
    console.log(`Retrieved ${contacts.length} contacts. Searching for matches...`);
    const searchTerms = ["priority", "wingo", "candler", "1st"];
    const matches = contacts.filter(c => {
      const name = (c.contact_name || "").toLowerCase();
      const comp = (c.company_name || "").toLowerCase();
      const email = (c.email || "").toLowerCase();
      return searchTerms.some(term => name.includes(term) || comp.includes(term) || email.includes(term));
    });

    console.log(`Found ${matches.length} matching contacts:`);
    for (const c of matches) {
      console.log({
        contact_id: c.contact_id,
        contact_name: c.contact_name,
        company_name: c.company_name,
        email: c.email,
        phone: c.phone,
        outstanding_receivable: c.outstanding_receivable_amount
      });
    }

  } catch (error) {
    console.error(error);
  }
}

main();
