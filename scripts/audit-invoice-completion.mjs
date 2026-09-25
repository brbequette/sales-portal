import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'

// Read-only completeness evidence. Presence is not a certification of historical costs.
const prisma = new PrismaClient({ log: [] })
const num = value => {
  if (value == null || value === '') return null
  const parsed = Number(String(value).replace(/[$,%]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}
const first = (...values) => values.map(num).find(value => value !== null) ?? null
const field = (record, key) => first(record[key + '_unformatted'], record[key], record.custom_field_hash?.[key + '_unformatted'], record.custom_field_hash?.[key], ...(Array.isArray(record.custom_fields) ? record.custom_fields.filter(item => item.api_name === key).map(item => item.value) : []))
try {
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    const rows = await tx.invoice.findMany({ orderBy: { id: 'asc' } })
    const summary = { invoices: rows.length, years: {}, reasons: {}, statuses: {} }
    const documents = rows.map(row => {
      const items = row.items || {}, raw = row.rawData || {}
      const lines = Array.isArray(raw.line_items) && raw.line_items.length ? raw.line_items : Array.isArray(items.line_items) ? items.line_items : []
      const reasons = []
      const subtotal = first(items.sub_total, items.subTotal, raw.sub_total)
      const cf = key => first(field(items, key), field(raw, key))
      const subject = first(items.deadCostSubjectToVig, cf('cf_dead_cost_subject_to_vig'))
      const noVig = first(items.deadCostNoVig, cf('cf_dead_cost_no_vig'))
      const vig = first(row.computedVigRate, items.vigRate, cf('cf_salesperson_vig'))
      const fees = first(items.ccFees, cf('cf_credit_card_processing_fees'))
      const additional = first(items.additionalCosts, cf('cf_additional_costs_to_order'))
      const profit = first(row.computedProfit, items.profit, cf('cf_profit'))
      const commission = first(items.salesCommission, items.commission, cf('cf_commision_amount'))
      if (!lines.length) reasons.push('NO_STORED_LINES')
      if (lines.some(line => num(line.quantity) > 0 && first(line.purchase_rate, line.cost_price, line.cost) == null)) reasons.push('LINE_COST_EVIDENCE_MISSING')
      if (items.usedFallbackCost === true || items.usedFallbackCost === 'true') reasons.push('FALLBACK_COST_FLAG')
      if (subtotal == null) reasons.push('SUBTOTAL_MISSING')
      if (subject == null || noVig == null) reasons.push('COST_BUCKETS_MISSING')
      if (vig == null) reasons.push('VIG_MISSING')
      if (fees == null || additional == null) reasons.push('EXPLICIT_FEE_INPUTS_MISSING')
      if (profit == null || commission == null) reasons.push('PROFIT_OR_COMMISSION_MISSING')
      if (row.syncConflict) reasons.push('SYNC_CONFLICT')
      if (row.pendingZohoFetch) reasons.push('PENDING_PROVIDER_FETCH')
      if (row.pendingCostSync) reasons.push('PENDING_COST_SYNC')
      let arithmeticChecked = false
      if ([subtotal, subject, noVig, vig, fees, additional, profit].every(value => value !== null)) {
        arithmeticChecked = true
        if (Math.abs(profit - (subtotal - subject * vig - noVig - fees - additional)) > 0.011) reasons.push('PROFIT_ARITHMETIC_MISMATCH')
      }
      for (const reason of reasons) summary.reasons[reason] = (summary.reasons[reason] || 0) + 1
      const year = row.issueDate.getUTCFullYear()
      summary.years[year] ||= { invoices: 0, arithmeticChecked: 0, withFindings: 0 }
      summary.years[year].invoices++
      summary.years[year].arithmeticChecked += Number(arithmeticChecked)
      summary.years[year].withFindings += Number(reasons.length > 0)
      summary.statuses[row.status] = (summary.statuses[row.status] || 0) + 1
      return { id: row.id, invoiceNumber: row.invoiceNumber || row.computedInvoiceNumber, year, reasons, arithmeticChecked }
    })
    return { observedAt: new Date().toISOString(), mode: 'READ_ONLY', zohoCalls: 0, certifiedComplete: false, summary, documents }
  }, { timeout: 120000, isolationLevel: 'RepeatableRead' })
  fs.mkdirSync('artifacts/invoice-completion', { recursive: true })
  fs.writeFileSync('artifacts/invoice-completion/audit.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result.summary, null, 2))
} catch (error) {
  console.error(JSON.stringify({ error: error.code || error.name }))
  process.exitCode = 1
} finally { await prisma.$disconnect() }
