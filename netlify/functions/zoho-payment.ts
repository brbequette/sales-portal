import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken as getAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

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

  const { customerId, invoiceId, amount, authCode, paymentMethod, paymentDate } = body

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

    // Fetch the actual invoice from Zoho Books to get the true Books customer ID
    // since the local dbAccount.zohoId is the CRM ID, not the Books ID!
    try {
      const invFetchRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      if (invFetchRes.ok) {
        const invData: any = await invFetchRes.json()
        if (invData.code === 0 && invData.invoice && invData.invoice.customer_id) {
          booksCustomerId = invData.invoice.customer_id
        }
      }
    } catch (e) {
      console.warn("Could not fetch pre-payment invoice details from Zoho Books", e)
    }

    const payload = {
      customer_id: booksCustomerId,
      payment_mode: paymentMethod || 'Credit Card',
      amount: parseFloat(amount).toFixed(2),
      date: paymentDate || new Date().toISOString().split('T')[0],
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
