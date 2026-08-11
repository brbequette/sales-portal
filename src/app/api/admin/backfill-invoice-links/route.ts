import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken } from '@/lib/zoho-auth'
import { sendDirectEmail } from '@/lib/notifications'

const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORG_ID

// Rate limit: Zoho allows ~100 requests/minute for Books API
const BATCH_SIZE = 40
const DELAY_MS = 700 // ~85 req/min with overhead

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(req: NextRequest) {
  try {
    const token = await getZohoAccessToken()

    // Find invoices missing linked document IDs
    const invoices = await prisma.invoice.findMany({
      where: {
        salesOrderZohoId: null,
        estimateZohoId: null,
      },
      select: { id: true, zohoId: true },
      orderBy: { issueDate: 'desc' },
    })

    const total = invoices.length
    let processed = 0, linked = 0, errors = 0
    const errorDetails: string[] = []

    for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
      const batch = invoices.slice(i, i + BATCH_SIZE)

      for (const inv of batch) {
        try {
          const res = await fetch(
            `https://books.zoho.${ZOHO_DC}/api/v3/invoices/${inv.zohoId}?organization_id=${ORG_ID}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          if (!res.ok) {
            errors++
            if (errors <= 5) errorDetails.push(`${inv.zohoId}: HTTP ${res.status}`)
            continue
          }

          const data = await res.json()
          const invoice = data.invoice || {}

          const updateData: any = {}

          // Extract linked document IDs
          if (invoice.salesorder_id) updateData.salesOrderZohoId = invoice.salesorder_id
          if (invoice.estimate_id) updateData.estimateZohoId = invoice.estimate_id
          if (invoice.invoice_number) updateData.invoiceNumber = invoice.invoice_number
          if (invoice.salesorder_number) updateData.salesorderNumber = invoice.salesorder_number

          // Also update issueDate and amount if available (in case they changed)
          if (invoice.date) updateData.issueDate = new Date(invoice.date)
          if (invoice.total != null) updateData.amount = parseFloat(invoice.total) || 0
          if (invoice.due_date) updateData.dueDate = new Date(invoice.due_date)
          if (invoice.status) updateData.status = invoice.status
          if (invoice.balance != null) updateData.balance = parseFloat(invoice.balance) || 0
          if (invoice.payment_made != null) updateData.paymentMade = parseFloat(invoice.payment_made) || 0
          if (invoice.last_payment_date) updateData.lastPaymentDate = new Date(invoice.last_payment_date)

          // Store full individual response in items (richer than list API)
          updateData.items = invoice as any

          if (Object.keys(updateData).length > 0) {
            await prisma.invoice.update({
              where: { id: inv.id },
              data: updateData,
            })
            if (updateData.salesOrderZohoId || updateData.estimateZohoId) linked++
          }

          processed++
        } catch (e: any) {
          errors++
          if (errors <= 5) errorDetails.push(`${inv.zohoId}: ${e.message}`)
        }
      }

      // Rate limit between batches
      if (i + BATCH_SIZE < invoices.length) {
        await sleep(DELAY_MS)
      }
    }

    // Send completion email
    const notifyEmail = req.nextUrl.searchParams.get('notifyEmail')
    if (notifyEmail) {
      const html = `
        <div style="font-family:sans-serif;padding:20px;background:#111;color:#fff;border-radius:12px;">
          <h2 style="color:#34d399;">✅ Invoice Link Backfill Complete</h2>
          <table style="margin:16px 0;border-collapse:collapse;">
            <tr><td style="padding:6px 16px 6px 0;color:#999;">Total Invoices</td><td style="font-weight:bold;">${total}</td></tr>
            <tr><td style="padding:6px 16px 6px 0;color:#999;">Processed</td><td style="font-weight:bold;">${processed}</td></tr>
            <tr><td style="padding:6px 16px 6px 0;color:#999;">Linked to SO/Estimate</td><td style="font-weight:bold;color:#34d399;">${linked}</td></tr>
            <tr><td style="padding:6px 16px 6px 0;color:#999;">Errors</td><td style="font-weight:bold;color:${errors > 0 ? '#f87171' : '#34d399'};">${errors}</td></tr>
          </table>
          <p style="color:#666;font-size:12px;">All invoice dates, amounts, and payment info were also refreshed from Zoho.</p>
        </div>
      `
      await sendDirectEmail(notifyEmail, 'Ben', 'Invoice Link Backfill Complete', html)
    }

    return NextResponse.json({
      success: true,
      total,
      processed,
      linked,
      errors,
      errorSamples: errorDetails,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
