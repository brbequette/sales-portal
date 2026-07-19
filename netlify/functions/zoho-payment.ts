import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken as getAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';
import { getSystemSettings } from "./lib/settings"

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

  const { customerId, invoiceId, amount, authCode, paymentMethod, paymentDate, transId, last4, cardType } = body

  if (!customerId || !invoiceId || !amount) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing required fields" }) }
  }

  const settings = await getSystemSettings(prisma)
  const CC_FEE_RATE = settings.cc_fee_rate / 100;

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
    let invoiceData: any = null
    try {
      const invFetchRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      if (invFetchRes.ok) {
        const invJson: any = await invFetchRes.json()
        if (invJson.code === 0 && invJson.invoice) {
          invoiceData = invJson.invoice
          if (invJson.invoice.customer_id) {
            booksCustomerId = invJson.invoice.customer_id
          }
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
      reference_number: authCode || transId || '',
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

    // ── Post-Payment: Update invoice custom fields ──
    // Only update CC fields if this was a credit card payment
    const isCCPayment = (paymentMethod || 'Credit Card') === 'Credit Card' && (authCode || transId)
    const today = new Date().toISOString().split('T')[0]

    try {
      // Re-fetch invoice to get updated balance/status and custom fields
      const checkRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      })

      if (checkRes.ok) {
        const checkData: any = await checkRes.json()
        if (checkData.code === 0 && checkData.invoice) {
          const updatedInv = checkData.invoice
          const existingFields = updatedInv.custom_fields || []
          const fieldsToUpdate: any[] = []

          // Helper to find a custom field by partial label match
          const findField = (label: string) => existingFields.find((f: any) =>
            f.label.toUpperCase().trim().includes(label.toUpperCase())
          )

          // ── CC Processing Fees ──
          if (isCCPayment) {
            const ccFee = parseFloat(amount) * CC_FEE_RATE
            const ccFeeField = findField('CREDIT CARD PROCESSING')
            if (ccFeeField) {
              // Accumulate if there were prior CC charges
              const existingFee = parseFloat(ccFeeField.value || 0)
              fieldsToUpdate.push({
                customfield_id: ccFeeField.customfield_id,
                value: (existingFee + ccFee).toFixed(2)
              })
            }

            // ── CC Charge(s) Breakdown ──
            const ccBreakdownField = findField('CC CHARGE(S) BREAKDOWN')
            if (ccBreakdownField) {
              const newEntry = `Auth:${authCode || transId}, ${cardType || 'Card'} ****${last4 || '????'}, $${parseFloat(amount).toFixed(2)}, ${today}`
              const existing = ccBreakdownField.value || ''
              const breakdown = existing ? `${existing} | ${newEntry}` : newEntry
              fieldsToUpdate.push({
                customfield_id: ccBreakdownField.customfield_id,
                value: breakdown.substring(0, 255) // Zoho single-line text limit
              })
            }
          }

          // ── Paid In Full Date ──
          const isPaid = updatedInv.status === 'paid' || parseFloat(updatedInv.balance || 0) <= 0
          if (isPaid) {
            const paidDateField = findField('PAID IN FULL DATE')
            if (paidDateField && !paidDateField.value) {
              fieldsToUpdate.push({
                customfield_id: paidDateField.customfield_id,
                value: today
              })
            }
          }

          // ── Write custom fields to Zoho Books ──
          if (fieldsToUpdate.length > 0) {
            console.log(`Writing ${fieldsToUpdate.length} custom fields to invoice ${updatedInv.invoice_number}`)
            await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ custom_fields: fieldsToUpdate })
            })
          }

          // ── Update local DB ──
          if (dbInvoice) {
            const currentItems = (dbInvoice.items as any) || {}
            await prisma.invoice.update({
              where: { id: dbInvoice.id },
              data: {
                status: updatedInv.status,
                amount: parseFloat(updatedInv.balance || 0),
                items: {
                  ...currentItems,
                  balance: parseFloat(updatedInv.balance || 0),
                  ...(isCCPayment ? {
                    lastCCAuth: authCode || transId,
                    lastCCLast4: last4,
                    lastCCCardType: cardType,
                    ccFees: (parseFloat(currentItems.ccFees || 0) + parseFloat(amount) * CC_FEE_RATE),
                  } : {}),
                  ...(isPaid ? { paidInFullDate: today } : {})
                }
              }
            })
          }
        }
      }
    } catch (syncErr) {
      console.warn("Failed to sync invoice database/custom fields after payment:", syncErr)
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
