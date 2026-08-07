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

  const { invoiceId, remove, discountPercentage = 5 } = body
  if (!invoiceId) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing invoiceId" }) }
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
      const items = dbInvoice.items as any
      if (items?.booksInvoiceId) {
        booksInvoiceId = items.booksInvoiceId
      }
    }

    const token = await getAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    // 1. Fetch the invoice details from Zoho Books to get the subtotal
    const zohoRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    if (!zohoRes.ok) {
      const errorText = await zohoRes.text()
      throw new Error(`Zoho API failed to fetch invoice: ${errorText}`)
    }

    const zohoData: any = await zohoRes.json()
    if (zohoData.code !== 0) {
      throw new Error(`Zoho error: ${zohoData.message}`)
    }

    const invoice = zohoData.invoice
    if (!invoice) {
      throw new Error('Invoice not found.')
    }

    // 2. Calculate default values
    const subtotal = parseFloat(invoice.sub_total || invoice.total || 0)
    const discountVal = parseFloat((subtotal * 0.05).toFixed(2))

    let adjustment = invoice.adjustment || 0
    let adjustmentDescription = invoice.adjustment_description || ""
    if (adjustmentDescription === "5% Early Payment Discount") {
      adjustment = 0
      adjustmentDescription = ""
    }

    // 3. Update the invoice in Zoho Books
    const payload = {
      customer_id: invoice.customer_id,
      line_items: (invoice.line_items || []).map((item: any) => ({
        line_item_id: item.line_item_id,
        item_id: item.item_id,
        name: item.name,
        description: item.description,
        rate: item.rate,
        quantity: item.quantity,
        tax_id: item.tax_id,
        discount: remove ? 0 : `${discountPercentage}%`
      })),
      shipping_charge: invoice.shipping_charge || 0,
      discount_type: "item_level",
      is_discount_before_tax: !remove,
      adjustment: adjustment,
      adjustment_description: adjustmentDescription,
      reason: remove ? `Removing early payment discount.` : `Applying ${discountPercentage}% early payment discount as agreed with customer.`
    }

    const updateRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const updateData: any = await updateRes.json()
    if (updateData.code !== 0) {
      throw new Error(`Zoho error updating invoice: ${updateData.message}`)
    }

    const updatedInvoice = updateData.invoice
    const newBalance = updatedInvoice.balance
    const discountAmount = remove ? 0 : parseFloat(updatedInvoice.discount_total || updatedInvoice.discount_amount || discountVal || 0)

    // Update local database invoice amount as well to match Zoho Books balance
    if (dbInvoice) {
      const dbItems = (dbInvoice.items as any) || {}
      const newTotal = parseFloat(updatedInvoice.sub_total || updatedInvoice.total || newBalance)
      const deadCost = parseFloat(dbItems.deadCostTotal || 0)
      const newProfit = Math.max(0, newTotal - deadCost)

      await prisma.invoice.update({
        where: { id: dbInvoice.id },
        data: {
          amount: newTotal,
          items: {
            ...dbItems,
            balance: newBalance,
            profit: newProfit
          }
        }
      })
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ 
        success: true, 
        discountAmount: discountAmount,
        newBalance: newBalance,
        invoice: updatedInvoice 
      }),
    }
  } catch (err: any) {
    console.error('zoho-apply-discount error:', err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
