const fs = require("fs")
const path = require("path")

const content_path = "C:/Users/titan/.gemini/antigravity/brain/3656d197-df5e-4e8e-b5a6-1bfffa5eeaed/.system_generated/steps/3468/content.md"
const text = fs.readFileSync(content_path, "utf-8")
const parts = text.split("---")
const json_str = parts[parts.length - 1].trim()
const data = JSON.parse(json_str)

const users = [
  { id: "cmppb3e9y000e13bx4k91b4zt", name: "ROSS HAISLER", role: "Sales Representative", showOnSalesBoard: true },
  { id: "cmppb3de4000013bxtcprpvww", name: "MONTGOMERY MORGAN", role: "Sales Representative", showOnSalesBoard: true },
  { id: "cmppb3e1e000213bxgd47e5b2", name: "BRIAN BASILIERRE", role: "Sales Representative", showOnSalesBoard: true },
  { id: "cmppb3e1f000313bxgd47e5b3", name: "Benjamin Bequette", role: "Sales Representative", showOnSalesBoard: true }
]

const today = new Date("2026-07-31T11:45:46-07:00")
const currentYear = today.getFullYear()
const currentMonth = today.getMonth()

const repsMap = {}
users.forEach((u, i) => {
  repsMap[u.id] = {
    ...u,
    weekly: { sales: [0,0,0,0,0], profit: [0,0,0,0,0], deadCostNoVig: 0, deadCostSubjectToVig: 0, totalSales: 0, totalProfit: 0, dealsClosed: 0, commission: 0, invoices: [] }
  }
})

const day = today.getDay()
const diffToMonday = today.getDate() - day + (day === 0 ? -6 : 1)
const monday = new Date(today.getFullYear(), today.getMonth(), diffToMonday)

const weekDays = []
for (let i = 0; i < 5; i++) {
  const nextDay = new Date(monday)
  nextDay.setDate(monday.getDate() + i)
  const yyyy = nextDay.getFullYear()
  const mm = String(nextDay.getMonth() + 1).padStart(2, '0')
  const dd = String(nextDay.getDate()).padStart(2, '0')
  weekDays.push(`${yyyy}-${mm}-${dd}`)
}

console.log("Simulating with weekDays:", weekDays)

const normalizeRepName = (n) => {
  const val = (n || '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (val === 'ben bequette') return 'benjamin bequette'
  if (val === 'monty morgan') return 'montgomery morgan'
  if (val === 'ricky griffin') return 'richard griffin'
  return val
}

const getMatchedRep = (nameStr) => {
  const spNameNormalized = normalizeRepName(nameStr)
  if (!spNameNormalized) return null
  return Object.values(repsMap).find(r => {
    const repNameNormalized = normalizeRepName(r.name)
    return repNameNormalized.includes(spNameNormalized) || spNameNormalized.includes(repNameNormalized)
  })
}

data.documents.forEach((doc) => {
  const docType = doc.type
  const spName = (doc.salesperson || "").toUpperCase()
  if (!spName) {
    console.log(`Document ${doc.invoiceNumber} skipped: No salesperson name`)
    return
  }
  
  const matchedRep = getMatchedRep(spName)
  if (!matchedRep) {
    console.log(`Document ${doc.invoiceNumber} skipped: Salesperson ${spName} not found/matched on board`)
    return
  }

  if (docType === 'Quote') {
    return
  }

  if (docType === 'SalesOrder') {
    const raw = doc.raw || {}
    const soStatus = (raw.status || '').toLowerCase().trim()
    const isInvoicedOrClosed = soStatus === 'invoiced' || soStatus === 'closed' || soStatus === 'void' || raw.invoice_id || raw.invoice_number
    if (isInvoicedOrClosed) {
      console.log(`SalesOrder ${doc.invoiceNumber} skipped: Invoiced or closed (status=${soStatus}, invId=${raw.invoice_id})`)
      return
    }
  }

  if (docType === 'Invoice' || docType === 'SalesOrder') {
    const saleDate = doc.date ? doc.date.split('T')[0] : ''
    const amount = Number(doc.amount || 0)
    const profit = Number(doc.profit || 0)
    const inCurrentWeek = weekDays.includes(saleDate)

    console.log(`Processing ${docType} ${doc.invoiceNumber}: rep=${matchedRep.name}, date=${saleDate}, amount=${amount}, profit=${profit}, inCurrentWeek=${inCurrentWeek}`)

    if (inCurrentWeek) {
      const dayIdx = weekDays.indexOf(saleDate)
      matchedRep.weekly.sales[dayIdx] += amount
      matchedRep.weekly.profit[dayIdx] += profit
      matchedRep.weekly.totalSales += amount
      matchedRep.weekly.totalProfit += profit
    }
  }
})

console.log("\nResults:")
Object.values(repsMap).forEach(r => {
  console.log(`${r.name}: weeklySales=${JSON.stringify(r.weekly.sales)}, total=${r.weekly.totalSales}`)
})
