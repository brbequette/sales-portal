import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID;

// Module-level token cache (same as get-accounts.ts)
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getZohoAccessToken() {
  const now = Date.now();

  if (_cachedToken && now < _tokenExpiresAt - 5 * 60 * 1000) {
    return _cachedToken;
  }

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

      const data: any = await res.json();
      if (data.access_token) {
        _cachedToken = data.access_token;
        _tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
        return _cachedToken;
      }
      console.warn('PDF Zoho Token Refresh failed:', JSON.stringify(data));
    } catch (e: any) {
      console.warn('PDF Zoho Token fetch error:', e.message);
    }
  }

  if (process.env.ZOHO_ACCESS_TOKEN) {
    _cachedToken = process.env.ZOHO_ACCESS_TOKEN;
    _tokenExpiresAt = now + 55 * 60 * 1000;
    return _cachedToken;
  }

  throw new Error('No Zoho access token available for PDF download.');
}

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const { id, booksInvoiceId: queryBooksId, download } = event.queryStringParameters || {}

    let booksInvoiceId = queryBooksId

    // If booksInvoiceId was not passed directly, look it up in local Prisma DB by invoice id or zohoId
    if (!booksInvoiceId && id) {
      // Find invoice in database
      let dbInvoice = await prisma.invoice.findUnique({
        where: { zohoId: id }
      })

      if (!dbInvoice) {
        dbInvoice = await prisma.invoice.findUnique({
          where: { id: id }
        })
      }

      if (dbInvoice) {
        const metadata = dbInvoice.items as any
        booksInvoiceId = metadata?.booksInvoiceId
      }
    }

    if (!booksInvoiceId) {
      return {
        statusCode: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ success: false, message: "Missing booksInvoiceId or valid invoice id" })
      }
    }

    console.log(`Fetching PDF for Zoho Books Invoice ID: ${booksInvoiceId}...`);
    const token = await getZohoAccessToken();
    const pdfUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${booksInvoiceId}?organization_id=${ORG_ID}&accept=pdf`;
    
    const pdfRes = await fetch(pdfUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });

    if (!pdfRes.ok) {
      const errText = await pdfRes.text();
      console.error(`Zoho Books PDF API failed with status ${pdfRes.status}: ${errText}`);
      return {
        statusCode: pdfRes.status,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ success: false, message: "Failed to download PDF from Zoho Books", detail: errText })
      }
    }

    const arrayBuffer = await pdfRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Access-Control-Allow-Origin": "*",
    }

    if (download === "true") {
      headers["Content-Disposition"] = `attachment; filename="Invoice_${booksInvoiceId}.pdf"`;
    } else {
      headers["Content-Disposition"] = "inline; filename=invoice.pdf";
    }

    return {
      statusCode: 200,
      headers: headers,
      body: buffer.toString("base64"),
      isBase64Encoded: true
    }

  } catch (error: any) {
    console.error("PDF Handler Error:", error)
    return {
      statusCode: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
