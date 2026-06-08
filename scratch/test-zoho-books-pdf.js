const ZOHO_DC = process.env.ZOHO_DC || 'com';
const TEST_INVOICE_BOOKS_ID = '1254360000016826401';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID;

async function getZohoAccessToken() {
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
  if (data.access_token) {
    return data.access_token;
  }
  throw new Error('Failed to refresh token: ' + JSON.stringify(data));
}

async function main() {
  try {
    const token = await getZohoAccessToken();
    console.log("Token acquired!");
    console.log("Organization ID:", ORG_ID);

    // Try Zoho Books invoice details
    const detailUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${TEST_INVOICE_BOOKS_ID}?organization_id=${ORG_ID}`;
    console.log(`\nQuerying Books Invoice details from: ${detailUrl}`);
    const detailRes = await fetch(detailUrl, {
      headers: { 
        Authorization: `Zoho-oauthtoken ${token}`,
      },
    });
    console.log(`Detail Status: ${detailRes.status} ${detailRes.statusText}`);
    const detailData = await detailRes.json();
    console.log("Detail response keys:", Object.keys(detailData.invoice || {}));
    if (detailData.invoice) {
      console.log("Line Items:", JSON.stringify(detailData.invoice.line_items, null, 2));
      console.log("Total Amount:", detailData.invoice.total);
      console.log("Status:", detailData.invoice.status);
    }

    // Try Zoho Books PDF download
    const pdfUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${TEST_INVOICE_BOOKS_ID}?organization_id=${ORG_ID}&accept=pdf`;
    console.log(`\nDownloading PDF from: ${pdfUrl}`);
    const pdfRes = await fetch(pdfUrl, {
      headers: { 
        Authorization: `Zoho-oauthtoken ${token}`,
      },
    });
    console.log(`PDF Status: ${pdfRes.status} ${pdfRes.statusText}`);
    console.log("PDF Content-Type:", pdfRes.headers.get("content-type"));
    if (pdfRes.ok) {
      console.log("Successfully retrieved PDF binary. Length:", (await pdfRes.arrayBuffer()).byteLength);
    } else {
      console.log("Failed to download PDF. Body:", await pdfRes.text());
    }

  } catch (e) {
    console.error("Error:", e);
  }
}

main();
