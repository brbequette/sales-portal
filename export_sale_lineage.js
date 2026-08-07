/**
 * export_sale_lineage.js
 *
 * Builds a CSV of every sale's full lineage:
 *   Estimate → Sales Order → Packages → Purchase Orders → Invoice → Payments
 *
 * Linkage strategy:
 *   - SO.items.reference_number === Quote.items.estimateNumber  (EST-xxxx)
 *   - Invoice.items.estimateNumber === Quote.items.estimateNumber
 *   - Package.salesOrderNumber === SO.items.salesOrderNumber
 *   - PO.salesOrderNumber === SO.items.salesOrderNumber  (dropship)
 *   - Payment.invoiceId === Invoice.zohoId  OR  Payment.invoiceNumber === Invoice.items.invoiceNumber
 *
 * Run from the sales-portal directory:
 *   node export_sale_lineage.js
 */

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

// ── CSV helpers ───────────────────────────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return ''
  const s = String(val).replace(/"/g, '""')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
}

function row(values) {
  return values.map(esc).join(',')
}

function fmtDate(d) {
  if (!d) return ''
  try {
    return new Date(d).toISOString().split('T')[0]
  } catch { return '' }
}

function fmtMoney(n) {
  if (n === null || n === undefined || n === '') return ''
  const num = parseFloat(n)
  return isNaN(num) ? '' : num.toFixed(2)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading all entities...')

  const [quotes, salesOrders, invoices, packages, purchaseOrders, payments] = await Promise.all([
    prisma.quote.findMany(),
    prisma.salesOrder.findMany(),
    prisma.invoice.findMany(),
    prisma.package.findMany(),
    prisma.purchaseOrder.findMany(),
    prisma.payment.findMany(),
  ])

  console.log(`  Quotes: ${quotes.length}, SOs: ${salesOrders.length}, Invoices: ${invoices.length}`)
  console.log(`  Packages: ${packages.length}, POs: ${purchaseOrders.length}, Payments: ${payments.length}`)

  // ── Index builders ──────────────────────────────────────────────────────────

  // Quote by estimateNumber
  const quoteByEstNum = new Map()
  for (const q of quotes) {
    const estNum = q.items?.estimateNumber || q.items?.booksEstimateId
    if (estNum) quoteByEstNum.set(String(estNum), q)
  }

  // SO by reference_number (EST-xxxx) — the primary SO→Quote link
  // Also index SO by salesOrderNumber for package/PO lookup
  const soByEstRef = new Map()
  const soBySONum = new Map()
  for (const so of salesOrders) {
    const ref = so.items?.reference_number
    if (ref) soByEstRef.set(String(ref), so)
    const soNum = so.items?.salesOrderNumber
    if (soNum) soBySONum.set(String(soNum), so)
  }

  // Invoice by estimateNumber (EST-xxxx) — the Invoice→Quote/SO link
  // Multiple invoices can reference the same estimate (partial invoicing)
  const invsByEstNum = new Map()
  for (const inv of invoices) {
    const estNum = inv.items?.estimateNumber
    if (estNum) {
      if (!invsByEstNum.has(String(estNum))) invsByEstNum.set(String(estNum), [])
      invsByEstNum.get(String(estNum)).push(inv)
    }
  }

  // Packages by salesOrderNumber
  const pkgsBySONum = new Map()
  for (const pkg of packages) {
    const soNum = pkg.salesOrderNumber ? String(pkg.salesOrderNumber) : null
    const soId  = pkg.salesOrderId ? String(pkg.salesOrderId) : null
    const key   = soNum || soId
    if (key) {
      if (!pkgsBySONum.has(key)) pkgsBySONum.set(key, [])
      pkgsBySONum.get(key).push(pkg)
    }
  }

  // POs by salesOrderNumber (dropship) or referenceNumber
  const posBySONum = new Map()
  for (const po of purchaseOrders) {
    const soNum = po.salesOrderNumber ? String(po.salesOrderNumber) : null
    const ref   = po.referenceNumber  ? String(po.referenceNumber)  : null
    const key   = soNum || ref
    if (key) {
      if (!posBySONum.has(key)) posBySONum.set(key, [])
      posBySONum.get(key).push(po)
    }
  }

  // POs by invoiceNumber (non-SO POs that reference an invoice)
  const posByInvNum = new Map()
  for (const po of purchaseOrders) {
    if (po.invoiceNumber) {
      const key = String(po.invoiceNumber)
      if (!posByInvNum.has(key)) posByInvNum.set(key, [])
      posByInvNum.get(key).push(po)
    }
  }

  // Payments by invoiceId (Zoho invoice_id string) and by invoiceNumber
  const pmtsByInvZohoId = new Map()
  const pmtsByInvNum = new Map()
  for (const pmt of payments) {
    if (pmt.invoiceId) {
      const key = String(pmt.invoiceId)
      if (!pmtsByInvZohoId.has(key)) pmtsByInvZohoId.set(key, [])
      pmtsByInvZohoId.get(key).push(pmt)
    }
    if (pmt.invoiceNumber) {
      const key = String(pmt.invoiceNumber)
      if (!pmtsByInvNum.has(key)) pmtsByInvNum.set(key, [])
      pmtsByInvNum.get(key).push(pmt)
    }
  }

  // ── Build rows ──────────────────────────────────────────────────────────────
  // Strategy: iterate all invoices as the anchor (every closed sale is an invoice).
  // For each invoice, walk back to the SO and quote via estimateNumber.
  // Then attach packages and POs via the SO number.
  // Also handle invoices with no estimateNumber (no linked quote/SO in DB).

  const rows = []

  // Track which invoices we've processed via the estimate chain
  const processedInvIds = new Set()

  // ── Pass 1: Invoices that have an estimateNumber (linked chain) ────────────
  for (const inv of invoices) {
    const estNum = inv.items?.estimateNumber
    if (!estNum) continue

    processedInvIds.add(inv.id)
    const estNumStr = String(estNum)

    // Quote
    const quote = quoteByEstNum.get(estNumStr)

    // Sales Order (same estimate reference)
    const so = soByEstRef.get(estNumStr)
    const soNum = so ? String(so.items?.salesOrderNumber || '') : ''

    // Packages for this SO
    const pkgs = soNum ? (pkgsBySONum.get(soNum) || []) : []

    // POs for this SO (dropship + regular)
    const pos = soNum ? (posBySONum.get(soNum) || []) : []

    // Also check POs by invoice number
    const invNumStr = String(inv.items?.invoiceNumber || '')
    const invPosByInv = invNumStr ? (posByInvNum.get(invNumStr) || []) : []
    // Merge, dedup
    const allPOs = [...new Set([...pos, ...invPosByInv].map(p => p.id))].map(id =>
      [...pos, ...invPosByInv].find(p => p.id === id)
    )

    // Payments for this invoice
    const pmts = [
      ...(pmtsByInvZohoId.get(inv.zohoId) || []),
      ...(invNumStr ? (pmtsByInvNum.get(invNumStr) || []) : []),
    ]
    // Dedup payments
    const pmtsDeduped = [...new Map(pmts.map(p => [p.id, p])).values()]

    const invIt = inv.items || {}
    const soIt  = so?.items  || {}
    const qIt   = quote?.items || {}

    // Summarize packages
    const pkgCount       = pkgs.length
    const pkgTotalShip   = pkgs.reduce((s, p) => s + (p.shippingCharge || 0), 0)
    const pkgNumbers     = pkgs.map(p => p.packageNumber || p.zohoId).join('; ')
    const pkgCarriers    = [...new Set(pkgs.map(p => p.carrier).filter(Boolean))].join('; ')
    const pkgTracking    = pkgs.map(p => p.trackingNumber).filter(Boolean).join('; ')
    const pkgStatuses    = [...new Set(pkgs.map(p => p.status).filter(Boolean))].join('; ')

    // Summarize POs
    const poCount        = allPOs.length
    const dropships      = allPOs.filter(p => p.isDropshipment)
    const regularPOs     = allPOs.filter(p => !p.isDropshipment)
    const dropshipCount  = dropships.length
    const poTotalCost    = allPOs.reduce((s, p) => s + (p.total || 0), 0)
    const poVendors      = [...new Set(allPOs.map(p => p.vendorName).filter(Boolean))].join('; ')
    const dropVendors    = [...new Set(dropships.map(p => p.vendorName).filter(Boolean))].join('; ')
    const poStatuses     = [...new Set(allPOs.map(p => p.status).filter(Boolean))].join('; ')

    // Summarize payments
    const pmtTotal       = pmtsDeduped.reduce((s, p) => s + (p.amount || 0), 0)
    const pmtModes       = [...new Set(pmtsDeduped.map(p => p.mode).filter(Boolean))].join('; ')
    const pmtCount       = pmtsDeduped.length
    const lastPmtDate    = pmtsDeduped.length
      ? fmtDate(pmtsDeduped.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0].date)
      : ''

    // Invoice financials — prefer items fields (enriched), fall back to top-level
    const invSubTotal    = invIt.sub_total ?? inv.amount ?? ''
    const invDeadCost    = invIt.deadCostTotal ?? ''
    const invDeadProfit  = invIt.deadProfitActual ?? ''
    const invProfit      = invIt.profit ?? ''
    const invVig         = invIt.vig ?? invIt.vigRate ?? ''
    const invMargin      = invIt.marginPercent ?? ''
    const invCommission  = invIt.commission ?? ''
    const invBalance     = invIt.balance ?? inv.balance ?? ''
    const invCcFees      = invIt.ccFees ?? ''
    const invShipCharge  = invIt.shippingCharge ?? inv.actualShippingCost ?? ''

    rows.push([
      // ── Estimate / Quote ────────────────────────────────────────────
      estNum,
      fmtDate(quote?.createdAt),
      qIt.customer_name || invIt.customer_name || soIt.customer_name || '',
      qIt.salesperson || invIt.salesperson || soIt.salesperson_name || soIt.salesperson || '',
      fmtMoney(qIt.sub_total),
      quote?.status || '',
      quote?.zohoId || qIt.booksEstimateId || '',

      // ── Sales Order ─────────────────────────────────────────────────
      soNum,
      fmtDate(so?.orderDate || so?.createdAt),
      soIt.status || so?.status || '',
      fmtMoney(soIt.sub_total || so?.amount),
      fmtMoney(soIt.deadCostTotal),
      fmtMoney(soIt.deadProfitActual),
      fmtMoney(soIt.profit),
      soIt.salesperson_name || soIt.salesperson || '',
      so?.zohoId || soIt.booksSalesOrderId || '',

      // ── Packages ────────────────────────────────────────────────────
      pkgCount,
      pkgNumbers,
      pkgCarriers,
      pkgTracking,
      pkgStatuses,
      fmtMoney(pkgTotalShip),

      // ── Purchase Orders ─────────────────────────────────────────────
      poCount,
      dropshipCount,
      poVendors,
      dropVendors,
      poStatuses,
      fmtMoney(poTotalCost),

      // ── Invoice ─────────────────────────────────────────────────────
      invIt.invoiceNumber || '',
      fmtDate(inv.issueDate),
      fmtDate(inv.dueDate),
      invIt.status || inv.status || '',
      fmtMoney(invSubTotal),
      fmtMoney(invDeadCost),
      fmtMoney(invDeadProfit),
      fmtMoney(invProfit),
      fmtMoney(invVig),
      fmtMoney(invMargin),
      fmtMoney(invCommission),
      fmtMoney(invBalance),
      fmtMoney(invCcFees),
      fmtMoney(invShipCharge),
      inv.isWrittenOff ? 'YES' : '',
      fmtDate(inv.writtenOffAt),
      invIt.paidInFullDate || '',
      inv.zohoId || '',

      // ── Payments ────────────────────────────────────────────────────
      pmtCount,
      fmtMoney(pmtTotal),
      pmtModes,
      lastPmtDate,
    ])
  }

  // ── Pass 2: Invoices with NO estimateNumber (standalone invoices) ───────────
  for (const inv of invoices) {
    if (processedInvIds.has(inv.id)) continue

    const invIt     = inv.items || {}
    const invNumStr = String(invIt.invoiceNumber || '')

    // POs by invoice number only
    const allPOs = invNumStr ? (posByInvNum.get(invNumStr) || []) : []

    // Payments
    const pmts = [
      ...(pmtsByInvZohoId.get(inv.zohoId) || []),
      ...(invNumStr ? (pmtsByInvNum.get(invNumStr) || []) : []),
    ]
    const pmtsDeduped = [...new Map(pmts.map(p => [p.id, p])).values()]

    const poCount       = allPOs.length
    const dropshipCount = allPOs.filter(p => p.isDropshipment).length
    const poTotalCost   = allPOs.reduce((s, p) => s + (p.total || 0), 0)
    const poVendors     = [...new Set(allPOs.map(p => p.vendorName).filter(Boolean))].join('; ')
    const dropVendors   = [...new Set(allPOs.filter(p => p.isDropshipment).map(p => p.vendorName).filter(Boolean))].join('; ')
    const poStatuses    = [...new Set(allPOs.map(p => p.status).filter(Boolean))].join('; ')

    const pmtTotal    = pmtsDeduped.reduce((s, p) => s + (p.amount || 0), 0)
    const pmtModes    = [...new Set(pmtsDeduped.map(p => p.mode).filter(Boolean))].join('; ')
    const pmtCount    = pmtsDeduped.length
    const lastPmtDate = pmtsDeduped.length
      ? fmtDate(pmtsDeduped.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0].date)
      : ''

    const invSubTotal   = invIt.sub_total ?? inv.amount ?? ''
    const invDeadCost   = invIt.deadCostTotal ?? ''
    const invDeadProfit = invIt.deadProfitActual ?? ''
    const invProfit     = invIt.profit ?? ''
    const invVig        = invIt.vig ?? invIt.vigRate ?? ''
    const invMargin     = invIt.marginPercent ?? ''
    const invCommission = invIt.commission ?? ''
    const invBalance    = invIt.balance ?? inv.balance ?? ''
    const invCcFees     = invIt.ccFees ?? ''
    const invShipCharge = invIt.shippingCharge ?? inv.actualShippingCost ?? ''

    rows.push([
      // Estimate
      '', '', invIt.customer_name || '', invIt.salesperson || '', '', '', '',
      // Sales Order
      '', '', '', '', '', '', '', '', '',
      // Packages
      0, '', '', '', '', '',
      // POs
      poCount, dropshipCount, poVendors, dropVendors, poStatuses, fmtMoney(poTotalCost),
      // Invoice
      invIt.invoiceNumber || '',
      fmtDate(inv.issueDate),
      fmtDate(inv.dueDate),
      invIt.status || inv.status || '',
      fmtMoney(invSubTotal),
      fmtMoney(invDeadCost),
      fmtMoney(invDeadProfit),
      fmtMoney(invProfit),
      fmtMoney(invVig),
      fmtMoney(invMargin),
      fmtMoney(invCommission),
      fmtMoney(invBalance),
      fmtMoney(invCcFees),
      fmtMoney(invShipCharge),
      inv.isWrittenOff ? 'YES' : '',
      fmtDate(inv.writtenOffAt),
      invIt.paidInFullDate || '',
      inv.zohoId || '',
      // Payments
      pmtCount,
      fmtMoney(pmtTotal),
      pmtModes,
      lastPmtDate,
    ])
  }

  // ── Sort by invoice date desc ────────────────────────────────────────────
  rows.sort((a, b) => {
    const da = a[28] || ''  // invoice_date
    const db = b[28] || ''
    return db.localeCompare(da)
  })

  // ── Write CSV ────────────────────────────────────────────────────────────
  const headers = [
    // Estimate
    'estimate_number',
    'estimate_date',
    'customer_name',
    'salesperson',
    'estimate_subtotal',
    'estimate_status',
    'estimate_zoho_id',

    // Sales Order
    'salesorder_number',
    'salesorder_date',
    'salesorder_status',
    'salesorder_subtotal',
    'so_dead_cost_total',
    'so_dead_profit',
    'so_profit',
    'so_salesperson',
    'salesorder_zoho_id',

    // Packages
    'package_count',
    'package_numbers',
    'package_carriers',
    'package_tracking_numbers',
    'package_statuses',
    'package_total_shipping_charge',

    // Purchase Orders
    'po_count',
    'dropship_count',
    'po_vendors',
    'dropship_vendors',
    'po_statuses',
    'po_total_cost',

    // Invoice
    'invoice_number',
    'invoice_date',
    'invoice_due_date',
    'invoice_status',
    'invoice_subtotal',
    'invoice_dead_cost_total',
    'invoice_dead_profit',
    'invoice_profit',
    'invoice_vig_rate',
    'invoice_margin_pct',
    'invoice_commission',
    'invoice_balance',
    'invoice_cc_fees',
    'invoice_actual_shipping_cost',
    'is_written_off',
    'written_off_date',
    'paid_in_full_date',
    'invoice_zoho_id',

    // Payments
    'payment_count',
    'total_payments_received',
    'payment_modes',
    'last_payment_date',
  ]

  const outPath = path.join(__dirname, 'sale_lineage_export.csv')
  const lines = [headers.join(','), ...rows.map(r => row(r))]
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8')

  console.log(`\n✅ Written: ${outPath}`)
  console.log(`   Total rows: ${rows.length}`)
  console.log(`   - Linked (estimate chain): ${rows.length - (invoices.length - processedInvIds.size)}`)
  console.log(`   - Standalone invoices: ${invoices.length - processedInvIds.size}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
