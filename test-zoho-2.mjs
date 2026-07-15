import { getZohoAccessToken } from "./netlify/functions/lib/zoho-auth.js";
import fetch from "node-fetch"; // need to require fetch if node < 18, but wait, next.js has it in global scope if it's new node. Let's just use global fetch if available

(async () => {
  try {
    const t = await getZohoAccessToken();
    const ORG_ID = '747986877'; // Found earlier
    
    // Check if the invoice exists in Books
    const url = `https://www.zohoapis.com/books/v3/invoices?organization_id=${ORG_ID}&invoice_number=8189`;
    console.log("Fetching:", url);
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${t}` } });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2).slice(0, 500));

    // Try fetching with the CRM ID directly to reproduce error 57
    const crmIdUrl = `https://www.zohoapis.com/books/v3/invoices/1254380000018620558?organization_id=${ORG_ID}`;
    const res2 = await fetch(crmIdUrl, { headers: { Authorization: `Zoho-oauthtoken ${t}` } });
    console.log("CRM ID Fetch Status:", res2.status);
    const text2 = await res2.text();
    console.log("CRM ID Fetch Data:", text2);
  } catch(e) {
    console.error(e);
  }
})();
