import { calculateCardProcessingFee, isCardPaymentMode } from '../src/lib/invoice-card-fee'
import { isNoVigItem, isGiftItem, isSwagItem } from '../netlify/functions/lib/cost-calculations'
import { financialZohoLineItems } from '../src/lib/zoho-line-items'
import { classifyLineWithEvidence } from '../tools/financial-reconciliation/reconciliation-calculations.mjs'

export const number = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[$,%]/g, ''))
  return Number.isFinite(n) ? n : null
}
const money = (v: number) => Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 100) / 100
const field = (doc: any, label: string, key: string) => {
  const f = doc.custom_fields?.find((f: any) => f.api_name === key || String(f.label).toUpperCase().trim() === label)
  return number(f?.value ?? doc[key + '_unformatted'] ?? doc[key])
}
export function invoiceCalculationPlan(row: any, source: any, detail: any, payments: any[], users: any[], vigSettings: any) {
  const fail = (reason: string) => ({ ready: false as const, reason })
  if (row.syncConflict) return fail('SYNC_CONFLICT')
  if (!source) return fail('NO_PROVIDER_INVOICE')
  if (/^(void|voided|orphaned)$/i.test(source.status || row.status)) return fail('EXCLUDED_STATUS')
  const items = row.items || {}
  const doc = detail || items
  const subtotal = number(detail?.sub_total ?? items.sub_total ?? items.subTotal)
  const total = number(detail?.total ?? source.total)
  if (subtotal == null || total == null || total < 0) return fail('MISSING_TOTALS')
  let subject = number(detail ? field(detail, 'DEAD COST SUBJECT TO VIG', 'cf_dead_cost_subject_to_vig') : items.deadCostSubjectToVig)
  let noVig = number(detail ? field(detail, 'DEAD COST NO VIG', 'cf_dead_cost_no_vig') : items.deadCostNoVig)
  if (items.usedFallbackCost === true || items.usedFallbackCost === 'true') { subject = null; noVig = null }
  let costSource = detail ? 'PROVIDER_COST_BUCKETS' : 'STORED_COST_BUCKETS'
  if (subject == null || noVig == null) {
    if (!detail) return fail('NEEDS_PROVIDER_DETAIL')
    const lines = financialZohoLineItems(detail.line_items)
    if (!lines.length) return fail('NO_COST_LINES')
    subject = 0; noVig = 0
    for (const line of lines) {
      const classification = classifyLineWithEvidence({ itemName: line.name, itemType: line.chargeType || '', sku: line.sku, itemId: line.item_id })
      if (classification.classification === 'nonphysical') continue
      // Existing invoice UI excludes manual tracking annotations. These exact
      // zero-value memo rows carry no product cost; gifts never use this rule.
      const memo = /^(TRACKING INFORMATION|TRACKING NUMBER\(S\)|ADJUSTMENT DESCRIPTION|DISCOUNT DESCRIPTION|NOTE|PO#|WRITE OFF REASON|FREE\s*SHIP(?:PING)?)$/i.test(String(line.name || '').trim())
      if (memo && number(line.rate) === 0 && number(line.item_total) === 0) continue
      const qty = number(line.quantity), cost = number(line.purchase_rate)
      if (qty == null || qty < 0 || cost == null || cost <= 0) return fail('UNVERIFIED_LINE_COST')
      if (isNoVigItem(line)) noVig += qty * cost
      else subject += qty * cost
    }
    costSource = 'PROVIDER_LINE_COSTS'
  }
  if (subject < 0 || noVig < 0) return fail('NEGATIVE_COST_BUCKET')
  subject = money(subject)
  noVig = money(noVig)
  const additional = detail ? field(detail, 'ADDITIONAL COSTS TO ORDER', 'cf_additional_costs_to_order') ?? 0 : number(items.additionalCosts) ?? 0
  const date = String(detail?.date || source.date || items.date || row.issueDate).slice(0,10)
  const year = Number(date.slice(0,4)), month = date.slice(0,7)
  const salesperson = String(detail?.salesperson_name || source.salesperson_name || items.salesperson || '').trim()
  if (!salesperson) return fail('MISSING_SALESPERSON')
  const user = users.find((u: any) => String(u.name || '').trim().toLowerCase() === salesperson.toLowerCase())
  const monty = /montgomery|morgan/i.test(salesperson)
  const monthGoals = user ? vigSettings[user.id]?.monthlyVigGoals || [] : []
  const explicitMonthly = number(monthGoals.find((g: any) => g.monthKey === month)?.manualVigRate)
  let vig = monty ? 1 : field(doc, 'SALESPERSON VIG RATE', 'cf_salesperson_vig_rate')
    ?? (user?.constantVigEnabled ? number(user.constantVigValue) : null)
    ?? explicitMonthly ?? (year <= 2024 ? 1.3 : null)
  if (vig == null) {
    const historicalVig = detail ? field(detail, 'SALESPERSON VIG', 'cf_salesperson_vig') : number(items.vigRate ?? row.computedVigRate)
    if (!user && ![1,1.3,1.5].includes(historicalVig!)) return fail('UNRESOLVED_REP_VIG')
    const goals = user ? vigSettings[user.id]?.monthlyVigGoals || [] : []
    const manual = goals.find((g: any) => g.monthKey === month)?.manualVigRate
    const prior = new Date(`${date}T12:00:00Z`); prior.setUTCDate(1); prior.setUTCMonth(prior.getUTCMonth()-1)
    vig = user?.constantVigEnabled && number(user.constantVigValue) != null ? number(user.constantVigValue)
      : number(manual) ?? ([1,1.3,1.5].includes(historicalVig!) ? historicalVig : (goals.find((g: any)=>g.monthKey===prior.toISOString().slice(0,7))?.status === 'MISSED' ? 1.5 : 1.3))
  }
  if (vig == null || vig <= 0) return fail('INVALID_VIG')
  const paid = payments.filter(p=>Number(p.amount)>0)
  const mode = (p: any) => p.payment_mode ?? p.mode
  // Unknown/offline payment labels cannot prove whether a card was used.
  const knownNonCard = /^(check|cash|cashier's check|ach transfer|bank transfer|zelle|money order|credit note|credit from return)$/i
  const hasCard = paid.some(p=>isCardPaymentMode(mode(p)))
  if (!hasCard && paid.some(p=>!knownNonCard.test(String(mode(p)||'').trim()))) return fail('UNVERIFIED_PAYMENT_MODE')
  const fees = hasCard ? calculateCardProcessingFee(total) : 0
  const expectedPaid = total - Number(detail?.balance ?? source.balance ?? 0) - Number(source.write_off_amount || 0)
  if (expectedPaid > 0.011 && paid.length === 0) return fail('MISSING_PAYMENT_EVIDENCE')
  let commissionPercent = field(doc, 'COMMISSION FROM PROFIT %', 'cf_commision_from_profit') ?? number(items.commissionPercent) ?? 50
  if (commissionPercent===40 && (year===2025 || year===2026)) commissionPercent=50
  if (commissionPercent < 0 || commissionPercent > 100) return fail('INVALID_COMMISSION_PERCENT')
  const deadCostTotal = money(subject + noVig + additional)
  const deadCostPlusVig = money(subject * vig + noVig)
  const profit = money(subtotal - deadCostPlusVig - fees - additional)
  const commission = money(profit * (profit < 0 ? 0.5 : commissionPercent / 100))
  const isPaid = String(detail?.status || source.status).toLowerCase() === 'paid' || number(detail?.balance ?? source.balance) === 0
  const lines = financialZohoLineItems(doc.line_items)
  const requiresReview = profit <= 0 && (!lines.length || !lines.every(line => isGiftItem(line) || isSwagItem(line.name)))
  return { ready: true as const, costSource, isPaid, requiresReview, values: { sub_total: subtotal, subTotal: subtotal, total, deadCostSubjectToVig: money(subject), deadCostNoVig: money(noVig), deadCostTotal, deadCostPlusVig, ccFees: fees, additionalCosts: money(additional), vigRate: vig, profit, deadProfitActual: money(subtotal-deadCostTotal-fees), commission, salesCommission: commission, commissionPercent, usedFallbackCost: false } }
}
