import { Handler } from "@netlify/functions"
import { getZohoAccessToken as getAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

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

  const { invoiceId, items, reason } = body
  if (!invoiceId || !items || !Array.isArray(items) || items.length === 0) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing invoiceId or items" }) }
  }

  try {
    let booksInvoiceId = invoiceId

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
      const dbItems = dbInvoice.items as any
      if (dbItems?.booksInvoiceId) {
        booksInvoiceId = dbItems.booksInvoiceId
      }
    }

    const token = await getAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    // Fetch the invoice from Zoho to get customer_id
    const invRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
      headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
    })
    const invData: any = await invRes.json()
    if (invData.code !== 0 || !invData.invoice) {
      throw new Error(`Zoho error: ${invData.message || 'Failed to fetch invoice'}`)
    }

    const customerId = invData.invoice.customer_id

    // Create the credit note
    const creditNotePayload: any = {
      customer_id: customerId,
      date: new Date().toISOString().split('T')[0],
      line_items: items.map((item: any) => ({
        item_id: item.item_id,
        quantity: item.quantity,
        rate: item.rate,
      })),
    }

    if (reason) {
      creditNotePayload.notes = reason
    }

    const createRes = await fetch(`${baseUrl}/creditnotes?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(creditNotePayload)
    })
    const createData: any = await createRes.json()
    if (createData.code !== 0) throw new Error(`Zoho error: ${createData.message || 'Failed to create credit note'}`)

    const creditNoteId = createData.creditnote?.creditnote_id
    if (!creditNoteId) throw new Error('Credit note created but no ID returned')

    // Calculate total amount to apply
    const totalAmount = items.reduce((sum: number, item: any) => {
      return sum + (parseFloat(item.quantity) * parseFloat(item.rate))
    }, 0)

    // Apply the credit note to the invoice
    const applyRes = await fetch(`${baseUrl}/creditnotes/${creditNoteId}/invoices?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        invoices: [{
          invoice_id: booksInvoiceId,
          amount_applied: totalAmount.toFixed(2)
        }]
      })
    })
    const applyData: any = await applyRes.json()
    if (applyData.code !== 0) {
      console.warn('Credit note created but failed to apply to invoice:', applyData.message)
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, creditNoteId }),
    }
  } catch (err: any) {
    console.error('zoho-credit-note error:', err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
