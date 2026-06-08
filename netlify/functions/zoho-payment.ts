import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID;

let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getAccessToken() {
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
    } catch (e: any) {
      console.warn('Zoho refresh token flow failed in zoho-payment:', e.message);
    }
  }

  if (process.env.ZOHO_ACCESS_TOKEN) {
    _cachedToken = process.env.ZOHO_ACCESS_TOKEN;
    _tokenExpiresAt = now + 55 * 60 * 1000;
    return _cachedToken;
  }

  throw new Error('No Zoho access token available.');
}

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  let body: any = {}
  try {
    body = JSON.parse(event.body || "{}")
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid JSON" }) }
  }

  const { customerId, invoiceId, amount, authCode } = body

  if (!customerId || !invoiceId || !amount) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing required fields" }) }
  }

  try {
    let booksInvoiceId = invoiceId
    let booksCustomerId = customerId

    // Try finding in database to resolve booksInvoiceId
    const dbInvoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { id: invoiceId },
          { zohoId: invoiceId }
        ]
      }
    })

    if (dbInvoice) {
      const items = dbInvoice.items as any
      if (items?.booksInvoiceId) {
        booksInvoiceId = items.booksInvoiceId
      }
    }

    // Try finding in database to resolve booksCustomerId
    const dbAccount = await prisma.account.findFirst({
      where: {
        OR: [
          { id: customerId },
          { zohoId: customerId }
        ]
      }
    })

    if (dbAccount) {
      booksCustomerId = dbAccount.zohoId
    }

    const token = await getAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    const payload = {
      customer_id: booksCustomerId,
      payment_mode: 'Credit Card',
      amount: parseFloat(amount).toFixed(2),
      date: new Date().toISOString().split('T')[0],
      reference_number: authCode || '',
      invoices: [
        {
          invoice_id: booksInvoiceId,
          amount_applied: parseFloat(amount).toFixed(2)
        }
      ]
    }

    const res = await fetch(`${baseUrl}/customerpayments?organization_id=${ORG_ID}`, {
      method: 'POST',
      headers: { 
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const data: any = await res.json()
    if (data.code !== 0) throw new Error(`Zoho error: ${data.message}`)

    // Sync database: retrieve updated invoice to get new balance and status
    try {
      const checkRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      })
      if (checkRes.ok) {
        const checkData: any = await checkRes.json()
        if (checkData.code === 0 && checkData.invoice && dbInvoice) {
          const updatedInv = checkData.invoice
          await prisma.invoice.update({
            where: { id: dbInvoice.id },
            data: {
              status: updatedInv.status,
              amount: updatedInv.balance,
              items: {
                ...(dbInvoice.items as any),
                balance: updatedInv.balance
              }
            }
          })
        }
      }
    } catch (syncErr) {
      console.warn("Failed to sync invoice database status after payment:", syncErr)
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, payment: data.payment }),
    }
  } catch (err: any) {
    console.error('zoho-payment error:', err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
