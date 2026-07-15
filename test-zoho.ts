import { getZohoAccessToken } from "./netlify/functions/lib/zoho-auth";

(async () => {
  try {
    const t = await getZohoAccessToken();
    const url = `https://www.zohoapis.com/books/v3/invoices?organization_id=747986877&invoice_number=8189`;
    console.log(url);
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${t}` } });
    console.log(res.status);
    const data = await res.json();
    console.log(JSON.stringify(data).slice(0, 500));
  } catch(e) {
    console.error(e);
  }
})();
