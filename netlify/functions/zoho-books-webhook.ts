import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getStore } from "@netlify/blobs"

const prisma = new PrismaClient()

/**
 * Zoho Books Webhook Receiver
 *
 * To activate, go to Zoho Books → Settings → Developer Space → Webhooks
 * Create webhooks for:
 *   - Invoices: Created, Updated  → POST https://your-site.netlify.app/.netlify/functions/zoho-books-webhook?type=Invoice
 *   - Sales Orders: Created, Updated → POST ...?type=SalesOrder
 *   - Estimates: Created, Updated → POST ...?type=Quote
 *
 * For security: set a secret token in Zoho and add it to your Netlify env as ZOHO_WEBHOOK_SECRET
 * The function will verify it before processing.
 */
export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const { type = "Invoice" } = event.queryStringParameters || {}

    // Optional: verify webhook secret token
    const secret = process.env.ZOHO_WEBHOOK_SECRET
    if (secret) {
      const incoming = event.headers['x-zoho-webhook-token'] || event.headers['x-webhook-token'] || ''
      if (incoming !== secret) {
        console.warn("Webhook secret mismatch — ignoring request")
        return { statusCode: 401, headers: cors, body: JSON.stringify({ error: "Unauthorized" }) }
      }
    }

    const body = JSON.parse(event.body || "{}")
    console.log(`Zoho Books Webhook received: type=${type}, event=${body.event_type || 'unknown'}`)

    // Zoho sends the document data inside body.data
    const doc = body.data || body
    if (!doc) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, message: "No data to process" }) }
    }

    // Extract the Books ID and number depending on type
    const booksId = doc.invoice_id || doc.salesorder_id || doc.estimate_id || doc.contact_id || doc.payment_id
    if (!booksId) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, message: "No Books ID in payload" }) }
    }

    // ── Payment webhook ──
    if (type === 'Payment') {
      const paymentId = doc.payment_id
      const invoicePayments = doc.invoices || []
      
      // Upsert the payment record
      await prisma.payment.upsert({
        where: { zohoId: paymentId },
        update: {
          amount: parseFloat(doc.amount || 0),
          date: doc.date ? new Date(doc.date) : null,
          mode: doc.payment_mode || null,
          status: doc.status || null,
          referenceNumber: doc.reference_number || null,
          bankCharges: parseFloat(doc.bank_charges || 0),
          invoiceId: invoicePayments[0]?.invoice_id || null,
          invoiceNumber: invoicePayments[0]?.invoice_number || null,
        },
        create: {
          zohoId: paymentId,
          amount: parseFloat(doc.amount || 0),
          date: doc.date ? new Date(doc.date) : null,
          mode: doc.payment_mode || null,
          status: doc.status || null,
          referenceNumber: doc.reference_number || null,
          bankCharges: parseFloat(doc.bank_charges || 0),
          invoiceId: invoicePayments[0]?.invoice_id || null,
          invoiceNumber: invoicePayments[0]?.invoice_number || null,
        }
      })

      // Update related invoice(s) balance and status
      for (const invPayment of invoicePayments) {
        const invId = invPayment.invoice_id
        if (!invId) continue
        
        const localInv = await prisma.invoice.findFirst({ where: { zohoId: invId } })
        if (!localInv) continue
        
        const currentItems = (localInv.items as any) || {}
        const newBalance = parseFloat(invPayment.balance_after_amount ?? invPayment.balance ?? currentItems.balance ?? 0)
        const isPaid = newBalance <= 0
        
        await prisma.invoice.update({
          where: { id: localInv.id },
          data: {
            status: isPaid ? 'Paid' : localInv.status,
            items: {
              ...currentItems,
              balance: newBalance,
              paymentDate: isPaid ? (doc.date || new Date().toISOString().split('T')[0]) : currentItems.paymentDate,
              lastSyncedAt: new Date().toISOString(),
            }
          }
        })
        console.log(`✅ Webhook: Updated invoice ${invId} balance=$${newBalance} ${isPaid ? '(PAID)' : ''}`)
      }

      console.log(`✅ Webhook: Upserted Payment ${paymentId} ($${doc.amount})`)
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, message: `Payment ${paymentId} synced, ${invoicePayments.length} invoice(s) updated` }) }
    }

    if (type === 'Vendor' || type === 'Contact') {
      if (doc.contact_type !== 'vendor') {
         return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, message: "Contact is not a vendor" }) }
      }
      
      await prisma.vendor.upsert({
        where: { zohoId: booksId },
        update: {
          contactName: doc.contact_name,
          companyName: doc.company_name,
          email: doc.email,
          phone: doc.phone,
          currencyId: doc.currency_id,
          paymentTerms: doc.payment_terms,
          billingAddress: doc.billing_address,
          shippingAddress: doc.shipping_address,
          customFields: doc.custom_fields,
          status: doc.status
        },
        create: {
          zohoId: booksId,
          contactName: doc.contact_name,
          companyName: doc.company_name,
          email: doc.email,
          phone: doc.phone,
          currencyId: doc.currency_id,
          paymentTerms: doc.payment_terms,
          billingAddress: doc.billing_address,
          shippingAddress: doc.shipping_address,
          customFields: doc.custom_fields,
          status: doc.status
        }
      })
      console.log(`o. Webhook: Upserted Vendor ${booksId} in local DB`)
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, message: `Vendor ${booksId} synced` }) }
    }

    // Find the local record
    let dbDoc: any = null
    if (type === 'Invoice') {
      dbDoc = await prisma.invoice.findFirst({ where: { zohoId: booksId } })
    } else if (type === 'SalesOrder') {
      dbDoc = await prisma.salesOrder.findFirst({ where: { zohoId: booksId } })
    } else if (type === 'Quote') {
      dbDoc = await prisma.quote.findFirst({ where: { zohoId: booksId } })
    }

    if (!dbDoc) {
      console.log(`${type} ${booksId} not found in local DB — skipping webhook update`)
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, message: "Record not in local DB" }) }
    }

    // For Quote/Estimate webhooks: only process estimates that have been converted to an invoice
    if (type === 'Quote') {
      const estStatus = (doc.status || '').toLowerCase()
      if (estStatus !== 'invoiced') {
        console.log(`Estimate ${booksId} status="${doc.status}" — not invoiced, skipping webhook sync`)
        return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, message: `Estimate not invoiced (status: ${doc.status}) — skipped` }) }
      }
    }

    // Build the updated items JSON from webhook payload
    const currentItems = (dbDoc.items as any) || {}
    const cfh = doc.custom_field_hash || {}
    const updatedItems = {
      ...currentItems,
      invoiceNumber: doc.invoice_number || currentItems.invoiceNumber,
      salesOrderNumber: doc.salesorder_number || currentItems.salesOrderNumber,
      estimateNumber: doc.estimate_number || currentItems.estimateNumber,
      sub_total: parseFloat(doc.sub_total || currentItems.sub_total || 0),
      balance: doc.balance ?? currentItems.balance ?? 0,
      shippingCharge: parseFloat(doc.shipping_charge || currentItems.shippingCharge || 0),
      customer_name: doc.customer_name || currentItems.customer_name,
      salesperson: doc.salesperson_name ? doc.salesperson_name.toUpperCase().trim() : currentItems.salesperson,
      line_items: doc.line_items || currentItems.line_items || [],
      custom_fields: doc.custom_fields || currentItems.custom_fields || [],
      paymentDate: doc.last_payment_date || currentItems.paymentDate,
      booksInvoiceId: type === 'Invoice' ? booksId : currentItems.booksInvoiceId,
      booksSalesOrderId: type === 'SalesOrder' ? booksId : currentItems.booksSalesOrderId,
      booksEstimateId: type === 'Quote' ? booksId : currentItems.booksEstimateId,
      // Profit & commission from custom_field_hash
      profit: cfh.cf_estimated_profit_unformatted !== undefined
        ? parseFloat(cfh.cf_estimated_profit_unformatted) || 0
        : cfh.cf_dead_cost_total_unformatted !== undefined
          ? parseFloat(doc.sub_total || 0) - parseFloat(cfh.cf_dead_cost_total_unformatted)
          : currentItems.profit ?? 0,
      commission: cfh.cf_commission_amount_unformatted !== undefined
        ? parseFloat(cfh.cf_commission_amount_unformatted) || 0
        : currentItems.commission ?? 0,
      vig: cfh.cf_salesperson_vig_unformatted !== undefined
        ? parseFloat(cfh.cf_salesperson_vig_unformatted) || 1.3
        : currentItems.vig ?? 1.3,
      lastSyncedAt: new Date().toISOString(),
    }

    // Determine status
    let status = dbDoc.status
    const zStatus = (doc.status || '').toLowerCase()
    if (zStatus === 'paid' || doc.balance === 0 || zStatus === 'closed' || zStatus === 'invoiced') status = 'Paid'
    else if (zStatus === 'void' || zStatus === 'voided' || zStatus === 'declined') status = 'Void'
    else if (zStatus === 'writeoff' || zStatus === 'write_off' || zStatus === 'bad debt') status = 'Writeoff'
    else if (zStatus === 'draft') status = 'Draft'
    else if (doc.status) status = doc.status.charAt(0).toUpperCase() + doc.status.slice(1)

    // Write to DB
    if (type === 'Invoice') {
      await prisma.invoice.update({ where: { id: dbDoc.id }, data: { status, items: updatedItems } })
    } else if (type === 'SalesOrder') {
      await prisma.salesOrder.update({ where: { id: dbDoc.id }, data: { status, items: updatedItems } })
    } else {
      await prisma.quote.update({ where: { id: dbDoc.id }, data: { status, items: updatedItems } })
    }

    console.log(`✅ Webhook: Updated ${type} ${booksId} in local DB (status: ${status}, ${(updatedItems.line_items || []).length} line items)`)

    // Invalidate cached PDF so next view gets a fresh copy from Zoho
    try {
      const store = getStore({ name: "invoice-pdfs", consistency: "strong" })
      const t = type === 'SalesOrder' ? 'so' : type === 'Quote' ? 'qte' : 'inv'
      await store.delete(`pdf/${t}/${booksId}`)
      console.log(`🗑️  Invalidated stale PDF cache for ${type} ${booksId}`)
    } catch (_) {
      // Non-fatal — blob store may be unavailable during local dev
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, message: `${type} ${booksId} synced` })
    }
  } catch (err: any) {
    console.error("zoho-books-webhook error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
