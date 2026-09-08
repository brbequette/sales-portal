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
      integrationStates,
      failedActions,
      deadLetterActions,
      openExceptions,
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
      prisma.integrationSyncState.findMany({ orderBy: { entityType: 'asc' } }),
      prisma.operationalAction.count({ where: { status: 'FAILED' } }),
      prisma.operationalAction.count({ where: { status: 'DEAD_LETTER' } }),
      prisma.integrationException.count({ where: { status: 'OPEN' } }),
    ])

    const byType = new Map(integrationStates.map(state => [state.entityType.toLowerCase(), state]))
    function freshness(entityType: string) {
      const state = byType.get(entityType.toLowerCase())
      const latest = state?.lastSuccessAt
      if (!latest) return { lastSync: null, hoursAgo: null, status: 'never' as const, telemetry: state || null }
      const hoursAgo = Math.round((now - latest.getTime()) / (1000 * 60 * 60) * 10) / 10
      const status = hoursAgo < 24 ? 'healthy' as const : hoursAgo < 72 ? 'stale' as const : 'critical' as const
      return { lastSync: latest.toISOString(), hoursAgo, status, telemetry: state }
    }

    return NextResponse.json({
      success: true,
      tables: {
        Invoice:    { count: invoiceCount,  ...freshness('invoice'),  pendingSync: pendingInvoices },
        SalesOrder: { count: soCount,       ...freshness('salesorder'), pendingSync: pendingSOs },
        Quote:      { count: quoteCount,    ...freshness('quote'), pendingSync: pendingQuotes },
        Account:    { count: accountCount,  ...freshness('account') },
        Contact:    { count: contactCount,  ...freshness('contact') },
        Payment:    { count: paymentCount,  ...freshness('payment') },
        Product:    { count: productCount,  ...freshness('product') },
      },
      health: {
        orphanPayments: orphanPayments,
        nullSalesperson: nullSalesperson,
        pendingCostCalc: pendingInvoices + pendingSOs + pendingQuotes,
        failedActions,
        deadLetterActions,
        openExceptions,
      },
      integrationStates,
    })
  } catch (err: any) {
    console.error('sync-dashboard error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
