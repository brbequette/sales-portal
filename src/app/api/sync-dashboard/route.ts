import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdministrator } from '@/lib/auth-helpers'

/**
 * GET /api/sync-dashboard
 *
 * Comprehensive sync health dashboard — returns per-table record counts,
 * freshness, pending cost calculations, and data quality metrics.
 * Zero Zoho API calls — all data from local DB.
 */
export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  try {
    const now = Date.now()

    // Parallel queries for speed
    const [
      invoiceCount,
      soCount,
      quoteCount,
      accountCount,
      contactCount,
      productCount,
      paymentCount,
      pendingInvoices,
      pendingSOs,
      pendingQuotes,
      orphanPayments,
      nullSalesperson,
      invoiceLatest,
      soLatest,
      quoteLatest,
      accountLatest,
      contactLatest,
      paymentLatest,
      productLatest,
    ] = await Promise.all([
      prisma.invoice.count(),
      prisma.salesOrder.count(),
      prisma.quote.count(),
      prisma.account.count(),
      prisma.contact.count(),
      prisma.product.count(),
      prisma.payment.count(),
      prisma.invoice.count({ where: { pendingZohoFetch: true } }),
      prisma.salesOrder.count({ where: { pendingZohoFetch: true } }),
      prisma.quote.count({ where: { pendingZohoFetch: true } }),
      prisma.payment.count({ where: { invoiceDbId: null } }),
      prisma.invoice.count({ where: { computedSalesperson: null } }),
      prisma.invoice.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      prisma.salesOrder.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      prisma.quote.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      prisma.account.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      prisma.contact.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      prisma.payment.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      prisma.product.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ])

    function freshness(latest: { updatedAt: Date | null } | null) {
      if (!latest?.updatedAt) return { lastSync: null, hoursAgo: null, status: 'never' as const }
      const hoursAgo = Math.round((now - latest.updatedAt.getTime()) / (1000 * 60 * 60) * 10) / 10
      const status = hoursAgo < 24 ? 'healthy' as const : hoursAgo < 72 ? 'stale' as const : 'critical' as const
      return { lastSync: latest.updatedAt.toISOString(), hoursAgo, status }
    }

    return NextResponse.json({
      success: true,
      tables: {
        Invoice:    { count: invoiceCount,  ...freshness(invoiceLatest),  pendingSync: pendingInvoices },
        SalesOrder: { count: soCount,       ...freshness(soLatest),       pendingSync: pendingSOs },
        Quote:      { count: quoteCount,    ...freshness(quoteLatest),    pendingSync: pendingQuotes },
        Account:    { count: accountCount,  ...freshness(accountLatest)  },
        Contact:    { count: contactCount,  ...freshness(contactLatest)  },
        Payment:    { count: paymentCount,  ...freshness(paymentLatest)  },
        Product:    { count: productCount,  ...freshness(productLatest)  },
      },
      health: {
        orphanPayments: orphanPayments,
        nullSalesperson: nullSalesperson,
        pendingCostCalc: pendingInvoices + pendingSOs + pendingQuotes,
      },
    })
  } catch (err: any) {
    console.error('sync-dashboard error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
