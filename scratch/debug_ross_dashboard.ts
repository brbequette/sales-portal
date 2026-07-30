import { PrismaClient } from "@prisma/client"
import { extractProfit, extractCommissionAmount, extractVigRate, extractDeadCostTotal, extractCustomFieldValue } from "../src/lib/custom-field-extractor"

const prisma = new PrismaClient()

function matchesRep(invoiceRep: string, filterName?: string | null, repEmail?: string | null): boolean {
  if (!filterName) return true
  const filter = filterName.trim().toUpperCase()
  if (!filter || filter.includes("ADMIN") || filter.includes("MYSELF") || filter === "ALL") return true

  const rep = (invoiceRep || "").trim().toUpperCase()
  if (!rep) return false

  if (rep.includes(filter) || filter.includes(rep)) return true

  const filterParts = filter.split(/\s+/).filter(Boolean)
  const repParts = rep.split(/\s+/).filter(Boolean)

  if (filterParts.length > 0 && repParts.length > 0) {
    const filterFirst = filterParts[0]
    const repFirst = repParts[0]
    if (filterFirst.length >= 3 && (filterFirst === repFirst || repFirst.startsWith(filterFirst) || filterFirst.startsWith(repFirst))) {
      return true
    }
  }

  if (repEmail) {
    const emailUpper = repEmail.trim().toUpperCase()
    const emailPrefix = emailUpper.split("@")[0].split(".")[0]
    if (emailPrefix.length >= 3 && (rep.includes(emailPrefix) || emailPrefix.includes(repParts[0]))) {
      return true
    }
  }

  return false
}

function parseLocalDate(dateStr: any): Date | null {
  if (!dateStr) return null
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr
  const s = String(dateStr).trim()
  if (!s) return null
  const clean = s.split('T')[0]
  const parts = clean.split('-')
  if (parts.length !== 3) return null
  const y = parseInt(parts[0])
  const m = parseInt(parts[1]) - 1
  const d = parseInt(parts[2])
  const dt = new Date(y, m, d, 12, 0, 0)
  return isNaN(dt.getTime()) ? null : dt
}

async function debug() {
  console.log("Loading invoices from DB...")
  const invoices = await prisma.invoice.findMany({
    include: { account: { select: { name: true } } }
  })
  const salesOrders = await prisma.salesOrder.findMany({
    include: { account: { select: { name: true } } }
  })

  console.log(`Loaded ${invoices.length} invoices, ${salesOrders.length} sales orders.`)

  const invoicesMapped = invoices.map(inv => {
    const items = (inv.items as any) || {}
    return {
      invoice_id: inv.zohoId,
      invoice_number: items.invoiceNumber || `INV-${inv.zohoId?.slice(-6)}`,
      customer_name: items.customer_name || inv.account?.name || 'Unknown',
      salesperson_name: items.salesperson || null,
      sub_total: items.sub_total ?? inv.amount ?? 0,
      total: items.sub_total ?? inv.amount ?? 0,
      balance: items.balance ?? 0,
      date: inv.issueDate?.toISOString().split('T')[0] || '',
      due_date: inv.dueDate?.toISOString().split('T')[0] || '',
      status: inv.status?.toLowerCase() || 'draft',
      is_sales_order: false,
      salesorder_date: items.salesorder_date || null,
      salesorder_salesperson_name: items.salesorder_salesperson_name || null,
    }
  })

  const sosMapped = salesOrders.map(so => {
    const items = (so.items as any) || {}
    return {
      invoice_id: so.zohoId || so.id,
      invoice_number: `SO-${items.salesOrderNumber || so.zohoId?.slice(-6) || so.id.slice(-6)}`,
      customer_name: items.customer_name || so.account?.name || 'Unknown',
      salesperson_name: items.salesperson || null,
      sub_total: items.sub_total ?? so.amount ?? 0,
      total: items.sub_total ?? so.amount ?? 0,
      balance: items.balance ?? so.amount ?? 0,
      date: so.orderDate?.toISOString().split('T')[0] || '',
      due_date: null,
      status: so.status?.toLowerCase() || 'open',
      is_sales_order: true,
      salesorder_date: so.orderDate?.toISOString().split('T')[0] || null,
      salesorder_salesperson_name: items.salesperson || null,
    }
  })

  const combined = [...invoicesMapped, ...sosMapped]
  console.log(`Total combined documents: ${combined.length}`)

  const activeRepFilter = "ROSS HAISLER"
  const repEmail = "ross@titandiamond.net"

  let matchedCount = 0
  let skippedReps = new Set<string>()

  for (const inv of combined) {
    const rep = inv.salesorder_salesperson_name || inv.salesperson_name || "Unknown"
    const match = matchesRep(rep, activeRepFilter, repEmail)
    if (match) {
      matchedCount++
    } else {
      skippedReps.add(rep)
    }
  }

  console.log(`Matched: ${matchedCount} documents for ROSS HAISLER.`)
  console.log("Skipped reps:", Array.from(skippedReps))
}

debug().catch(console.error)
