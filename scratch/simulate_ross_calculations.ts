import { GET } from "../src/app/api/zoho-invoices/route"
import { extractProfit, extractCommissionAmount, extractVigRate, extractDeadCostTotal, extractCustomFieldValue } from "../src/lib/custom-field-extractor"

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

async function main() {
  const req = new Request("http://localhost:3000/api/zoho-invoices")
  const res = await GET(req)
  const json = await res.json()
  const invoices = json.invoices || []

  console.log(`Loaded ${invoices.length} invoices from API.`)

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  // Calculate current week (Mon-Fri)
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  monday.setHours(0, 0, 0, 0)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  friday.setHours(23, 59, 59, 999)

  let weeklyTotal = 0, monthlyTotal = 0, monthlyProfit = 0, monthlyCommission = 0
  let monthlyDeals = 0, pipelineValue = 0, pipelineCount = 0
  let overdueCount = 0, overdueBalance = 0
  let monthlyVigPenaltyLoss = 0

  const activeRepFilter = "ROSS HAISLER"
  const repEmail = "ross@titandiamond.net"
  const isAllOrAdminFilter = false
  const repVigRate = 1.3

  let matchedLoopCount = 0

  for (const inv of invoices) {
    const amount = parseFloat(inv.sub_total || inv.total || "0")
    const profit = inv.deadProfit !== undefined ? Number(inv.deadProfit) : extractProfit(inv)
    const commission = inv.cf_commision_amount_unformatted !== undefined ? Number(inv.cf_commision_amount_unformatted) : extractCommissionAmount(inv)
    const dateStr = inv.salesorder_date || inv.date || ""

    const invDate = parseLocalDate(dateStr)
    if (!invDate) continue
    const status = (inv.status || "").toLowerCase()
    const rep = inv.salesorder_salesperson_name || inv.salesperson_name || "Unknown"

    if (!isAllOrAdminFilter && activeRepFilter) {
      const matchRep = matchesRep(rep, activeRepFilter, repEmail)
      if (!matchRep) continue
    }

    matchedLoopCount++

    // Weekly totals
    if (invDate >= monday && invDate <= friday) {
      weeklyTotal += amount
    }

    // Monthly totals (current month)
    if (invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear) {
      monthlyTotal += amount
      monthlyProfit += profit
      monthlyCommission += commission
      monthlyDeals++
    }

    // Pipeline (unpaid, non-draft)
    if (status !== "paid" && status !== "void" && status !== "draft") {
      pipelineValue += parseFloat(inv.balance || "0")
      pipelineCount++
    }

    // Overdue
    if (status === "overdue" || (inv.due_date && new Date(inv.due_date) < now && status !== "paid" && status !== "draft" && status !== "void")) {
      overdueCount++
      overdueBalance += parseFloat(inv.balance || "0")
    }
  }

  console.log(`Matched Loop Count: ${matchedLoopCount}`)
  console.log(`Weekly Total: $${weeklyTotal}`)
  console.log(`Monthly Total: $${monthlyTotal} (${monthlyDeals} deals)`)
  console.log(`Monthly Profit: $${monthlyProfit}`)
  console.log(`Monthly Commission: $${monthlyCommission}`)
  console.log(`Pipeline Value: $${pipelineValue} (${pipelineCount} invoices)`)
  console.log(`Overdue Balance: $${overdueBalance} (${overdueCount} invoices)`)
}

main().catch(console.error)
