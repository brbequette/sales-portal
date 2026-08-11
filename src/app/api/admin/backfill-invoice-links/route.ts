import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getZohoAccessToken } from '@/lib/zoho-auth'
import { sendDirectEmail } from '@/lib/notifications'

const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORG_ID

// Process in smaller chunks to stay within Netlify's function timeout (~26s)
// Each individual Zoho GET takes ~200-400ms, so ~50 per batch is safe
const DEFAULT_BATCH = 50
const DELAY_MS = 200

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(req: NextRequest) {
  try {
    const token = await getZohoAccessToken()
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || String(DEFAULT_BATCH))
    const notifyEmail = req.nextUrl.searchParams.get('notifyEmail')

    // Find invoices that haven't been individually fetched yet
    // Use invoiceNumber as a proxy — list API doesn't populate it, individual GET does
    const invoices = await prisma.invoice.findMany({
      where: {
        salesOrderZohoId: null,
        invoiceNumber: null,
      },
      select: { id: true, zohoId: true },
      orderBy: { issueDate: 'desc' },
      take: limit,
    })

    const remaining = await prisma.invoice.count({
      where: {
        salesOrderZohoId: null,
        invoiceNumber: null,
      },
    })

    const total = invoices.length
    let processed = 0, linked = 0, errors = 0
    const errorDetails: string[] = []

    for (const inv of invoices) {
      try {
        const res = await fetch(
          `https://books.zoho.${ZOHO_DC}/api/v3/invoices/${inv.zohoId}?organization_id=${ORG_ID}`,
          { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
        )

        if (!res.ok) {
          errors++
          if (errors <= 5) errorDetails.push(`${inv.zohoId}: HTTP ${res.status}`)
          // Mark it so we don't retry forever — set invoiceNumber to 'ERROR'
          await prisma.invoice.update({
            where: { id: inv.id },
            data: { invoiceNumber: `ERROR-${res.status}` },
          })
          continue
        }

        const data = await res.json()
        const invoice = data.invoice || {}

        const updateData: any = {
          // Always set invoiceNumber so this invoice is marked as "fetched"
          invoiceNumber: invoice.invoice_number || 'UNKNOWN',
        }

        // Extract linked document IDs
        if (invoice.salesorder_id) updateData.salesOrderZohoId = invoice.salesorder_id
        if (invoice.estimate_id) updateData.estimateZohoId = invoice.estimate_id
        if (invoice.salesorder_number) updateData.salesorderNumber = invoice.salesorder_number

        // Update core fields from richer individual response
        if (invoice.date) updateData.issueDate = new Date(invoice.date)
        if (invoice.total != null) updateData.amount = parseFloat(invoice.total) || 0
        if (invoice.due_date) updateData.dueDate = new Date(invoice.due_date)
        if (invoice.status) updateData.status = invoice.status
        if (invoice.balance != null) updateData.balance = parseFloat(invoice.balance) || 0
        if (invoice.payment_made != null) updateData.paymentMade = parseFloat(invoice.payment_made) || 0
        if (invoice.last_payment_date) updateData.lastPaymentDate = new Date(invoice.last_payment_date)

        // Store full individual response in items (richer than list API)
        updateData.items = invoice as any

        await prisma.invoice.update({
          where: { id: inv.id },
          data: updateData,
        })
        if (updateData.salesOrderZohoId || updateData.estimateZohoId) linked++
        processed++
      } catch (e: any) {
        errors++
        if (errors <= 5) errorDetails.push(`${inv.zohoId}: ${e.message}`)
      }

      // Small delay between requests
      await sleep(DELAY_MS)
    }

    const remainingAfter = remaining - processed
    const isComplete = remainingAfter <= 0

    // Send email only when all invoices are done
    if (isComplete && notifyEmail) {
      const totalLinked = await prisma.invoice.count({ where: { salesOrderZohoId: { not: null } } })
      const totalProcessed = await prisma.invoice.count({ where: { invoiceNumber: { not: null } } })
      const html = `
        <div style="font-family:sans-serif;padding:20px;background:#111;color:#fff;border-radius:12px;">
          <h2 style="color:#34d399;">✅ Invoice Link Backfill Complete</h2>
          <table style="margin:16px 0;border-collapse:collapse;">
            <tr><td style="padding:6px 16px 6px 0;color:#999;">Total Processed</td><td style="font-weight:bold;">${totalProcessed}</td></tr>
            <tr><td style="padding:6px 16px 6px 0;color:#999;">Linked to SO/Estimate</td><td style="font-weight:bold;color:#34d399;">${totalLinked}</td></tr>
          </table>
          <p style="color:#666;font-size:12px;">All invoice dates, amounts, and payment info have been refreshed from Zoho Books.</p>
        </div>
      `
      await sendDirectEmail(notifyEmail, 'Ben', 'Invoice Link Backfill Complete', html)
    }

    return NextResponse.json({
      success: true,
      batchProcessed: processed,
      batchLinked: linked,
      batchErrors: errors,
      remaining: remainingAfter,
      isComplete,
      errorSamples: errorDetails,
      message: isComplete
        ? 'All invoices have been processed!'
        : `Processed ${processed} invoices. ${remainingAfter} remaining. Call again to continue.`,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

// GET endpoint to check progress
export async function GET() {
  const total = await prisma.invoice.count()
  const processed = await prisma.invoice.count({ where: { invoiceNumber: { not: null } } })
  const linked = await prisma.invoice.count({ where: { salesOrderZohoId: { not: null } } })
  const withEstimate = await prisma.invoice.count({ where: { estimateZohoId: { not: null } } })
  const remaining = total - processed

  return NextResponse.json({
    total,
    processed,
    remaining,
    linkedToSO: linked,
    linkedToEstimate: withEstimate,
    percentComplete: total > 0 ? Math.round((processed / total) * 100) : 0,
  })
}
