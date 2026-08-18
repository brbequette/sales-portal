import { describe, it } from 'node:test'
import assert from 'node:assert'

// Testable aggregation logic extracted from useSalesBoardData
export function processSalesBoardDocuments({
  reps,
  invoices,
  salesOrders,
  quotes,
  weekDays,
  firstDayOfMonth,
  lastDayOfMonth,
  currentYear
}: {
  reps: { id: string; name: string; aliases?: string[]; payoutStructure?: string; weeklyTarget: number }[]
  invoices: any[]
  salesOrders: any[]
  quotes: any[]
  weekDays: string[]
  firstDayOfMonth: Date
  lastDayOfMonth: Date
  currentYear: number
}) {
  const repsMap: Record<string, any> = {}
  reps.forEach(r => {
    repsMap[r.id] = {
      ...r,
      activePipeline: { estimateCount: 0, estimateAmount: 0, salesOrderCount: 0, salesOrderAmount: 0 },
      weekly: { sales: [0,0,0,0,0], profit: [0,0,0,0,0], deadCostNoVig: 0, deadCostSubjectToVig: 0, totalSales: 0, totalProfit: 0, dealsClosed: 0, commission: 0, invoices: [] },
      mtd: { sales: 0, profit: 0, deadCostNoVig: 0, deadCostSubjectToVig: 0, commission: 0, dealsClosed: 0, invoices: [] },
      ytd: { sales: 0, profit: 0, deadCostNoVig: 0, deadCostSubjectToVig: 0, commission: 0, dealsClosed: 0, invoices: [] }
    }
  })

  const teamWeekly = { sales: 0, profit: 0, deadCostNoVig: 0, deadCostSubjectToVig: 0, commission: 0 }

  const getMatchedRep = (rawName: string) => {
    if (!rawName) return null
    const clean = rawName.toUpperCase().trim()
    for (const r of Object.values(repsMap)) {
      if (clean === r.name.toUpperCase().trim()) return r
      if (r.aliases && r.aliases.some((a: string) => clean === a.toUpperCase().trim())) return r
      const firstName = r.name.split(' ')[0].toUpperCase()
      if (clean === firstName || clean.startsWith(firstName + ' ')) return r
    }
    return null
  }

  // Pre-build index of Invoices to link with Sales Orders and avoid double counting
  const processedInvoiceIds = new Set<string>()
  const processedInvoiceNumbers = new Set<string>()
  const invoicedSOIds = new Set<string>()
  const invoicedSONumbers = new Set<string>()

  invoices.forEach((inv: any) => {
    if (!inv) return
    if (inv.id) processedInvoiceIds.add(String(inv.id).toLowerCase())
    if (inv.zohoId) processedInvoiceIds.add(String(inv.zohoId).toLowerCase())
    if (inv.invoiceNumber) processedInvoiceNumbers.add(String(inv.invoiceNumber).toLowerCase().trim())
    if (inv.invoiceNumberFull) processedInvoiceNumbers.add(String(inv.invoiceNumberFull).toLowerCase().trim())
    
    const linkedSOId = inv.linkedSalesOrderId || inv.salesOrderId
    const linkedSONum = inv.linkedSalesOrderNumber || inv.salesOrderNumber
    if (linkedSOId) invoicedSOIds.add(String(linkedSOId).toLowerCase())
    if (linkedSONum) invoicedSONumbers.add(String(linkedSONum).toLowerCase().trim())
  })

  const rawDocs = [...invoices, ...salesOrders, ...quotes]
  const countedDocs: any[] = []

  rawDocs.forEach((doc: any) => {
    let spName = (doc.salesperson || "").toUpperCase()
    const docType = doc.type || 'Invoice'

    let matchedRep: any = null
    if (spName) {
      if (spName.includes("PAUL") && (spName.includes("GENCUSKI") || spName.includes("GENKUSKI"))) return
      matchedRep = getMatchedRep(spName)
    }
    if (!matchedRep && doc.accountOwnerId) {
      matchedRep = Object.values(repsMap).find((r: any) => r.id === doc.accountOwnerId) || null
    }
    if (!matchedRep && !spName) return

    // 1. Estimates / Quotes
    if (docType === 'Quote') {
      const isConvertedToSO = doc.isConvertedToSO || false
      if (!isConvertedToSO && matchedRep) {
        matchedRep.activePipeline.estimateCount += 1
        matchedRep.activePipeline.estimateAmount += parseFloat(doc.amount || 0)
      }
      return
    }

    // 2. Sales Orders for Active Pipeline (Uninvoiced SOs)
    if (docType === 'SalesOrder') {
      const soStatus = (doc.status || '').toLowerCase().trim()
      const isClosedOrVoid = soStatus === 'closed' || soStatus === 'void' || soStatus === 'cancelled'
      const isLinkedToInv = doc.isLinkedToInvoice || !!(doc.linkedInvoiceId || doc.linkedInvoiceNumber) || soStatus === 'invoiced'
      
      // Only count open, uninvoiced Sales Orders in Active Pipeline badge
      if (!isLinkedToInv && !isClosedOrVoid && matchedRep) {
        matchedRep.activePipeline.salesOrderCount += 1
        matchedRep.activePipeline.salesOrderAmount += parseFloat(doc.amount || 0)
      }
    }

    // 3. Invoices & Sales Orders for Financial Numbers (Weekly / MTD / YTD)
    const docStatusLower = (doc.status || '').toLowerCase().trim()
    if (docStatusLower === 'void' || docStatusLower === 'cancelled') return

    // Deduplication against invoices
    let isAlreadyAccountedByInvoice = false
    if (docType === 'SalesOrder') {
      const soId = String(doc.zohoId || doc.id || '').toLowerCase()
      const soNum = String(doc.salesOrderNumber || doc.invoiceNumber || '').toLowerCase().trim()
      const linkedInvId = String(doc.linkedInvoiceId || '').toLowerCase()
      const linkedInvNum = String(doc.linkedInvoiceNumber || '').toLowerCase().trim()

      if (soId && invoicedSOIds.has(soId)) isAlreadyAccountedByInvoice = true
      if (soNum && invoicedSONumbers.has(soNum)) isAlreadyAccountedByInvoice = true
      if (linkedInvId && processedInvoiceIds.has(linkedInvId)) isAlreadyAccountedByInvoice = true
      if (linkedInvNum && processedInvoiceNumbers.has(linkedInvNum)) isAlreadyAccountedByInvoice = true
    }

    if (docType === 'SalesOrder' && isAlreadyAccountedByInvoice) {
      return
    }

    const saleDate = doc.date ? doc.date.split('T')[0] : ''
    if (!saleDate) return

    countedDocs.push(doc)

    const invDateObj = new Date(saleDate)
    const amount = Number(doc.amount || 0)
    const profit = Number(doc.profit || 0)
    const deadCostNoVig = Number(doc.deadCostNoVig || 0)
    const deadCostSubjectToVig = Number(doc.deadCostSubjectToVig || 0)

    const isPaid = doc.isPaid || false
    const isSameDayPaid = doc.isSameDayPaid || false
    const commObj = typeof doc.commission === 'object' && doc.commission !== null ? doc.commission : null
    const fullComm = commObj ? (commObj.total || 0) + (commObj.future || 0) : Number(doc.commission || 0)

    const isSinglePayment = matchedRep?.payoutStructure === 'single_payment'
    let commissionEarned = 0
    if (commObj) {
      commissionEarned = commObj.total || 0
    } else if (isSinglePayment) {
      commissionEarned = (isPaid || isSameDayPaid) ? fullComm : 0
    } else {
      commissionEarned = fullComm * 0.5
      if (isPaid || isSameDayPaid) {
        commissionEarned = fullComm
      }
    }

    const inCurrentWeek = weekDays.includes(saleDate)
    const isMTD = invDateObj >= firstDayOfMonth && invDateObj <= lastDayOfMonth
    const isYTD = invDateObj.getFullYear() === currentYear

    if (matchedRep) {
      if (inCurrentWeek) {
        const dayIdx = weekDays.indexOf(saleDate)
        if (dayIdx >= 0 && dayIdx < 5) {
          matchedRep.weekly.sales[dayIdx] += amount
          matchedRep.weekly.profit[dayIdx] += profit
        }
        matchedRep.weekly.totalSales += amount
        matchedRep.weekly.totalProfit += profit
        matchedRep.weekly.deadCostNoVig += deadCostNoVig
        matchedRep.weekly.deadCostSubjectToVig += deadCostSubjectToVig
        matchedRep.weekly.commission += commissionEarned
        matchedRep.weekly.dealsClosed += 1
        matchedRep.weekly.invoices.push({
          id: doc.id,
          zohoId: doc.zohoId,
          date: saleDate,
          customer: doc.accountName,
          amount,
          profit,
          invoiceNumber: doc.invoiceNumber,
          type: docType
        })

        teamWeekly.sales += amount
        teamWeekly.profit += profit
        teamWeekly.deadCostNoVig += deadCostNoVig
        teamWeekly.deadCostSubjectToVig += deadCostSubjectToVig
        teamWeekly.commission += commissionEarned
      }

      if (isMTD) {
        matchedRep.mtd.sales += amount
        matchedRep.mtd.profit += profit
        matchedRep.mtd.dealsClosed += 1
      }

      if (isYTD) {
        matchedRep.ytd.sales += amount
        matchedRep.ytd.profit += profit
        matchedRep.ytd.dealsClosed += 1
      }
    }
  })

  return { reps: Object.values(repsMap), teamWeekly, countedDocs }
}

describe('Sales Board Weekly Numbers & Sales Order Linkage', () => {
  const weekDays = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']
  const firstDayOfMonth = new Date(2026, 7, 1)
  const lastDayOfMonth = new Date(2026, 7, 31)
  const currentYear = 2026

  const reps = [
    { id: 'user-1', name: 'John Doe', weeklyTarget: 10000 },
    { id: 'user-2', name: 'Jane Smith', weeklyTarget: 10000 }
  ]

  it('shows uninvoiced Sales Orders on weekly numbers and updates daily grid', () => {
    const salesOrders = [
      {
        id: 'so-1',
        zohoId: 'so-zoho-1',
        type: 'SalesOrder',
        salesperson: 'John Doe',
        accountName: 'Acme Corp',
        status: 'confirmed',
        date: '2026-08-17', // Monday (dayIdx = 0)
        amount: 2500,
        profit: 1000,
        invoiceNumber: 'SO-1001'
      }
    ]

    const result = processSalesBoardDocuments({
      reps,
      invoices: [],
      salesOrders,
      quotes: [],
      weekDays,
      firstDayOfMonth,
      lastDayOfMonth,
      currentYear
    })

    const john = result.reps.find((r: any) => r.id === 'user-1')
    assert.strictEqual(john.weekly.sales[0], 2500)
    assert.strictEqual(john.weekly.profit[0], 1000)
    assert.strictEqual(john.weekly.totalSales, 2500)
    assert.strictEqual(john.weekly.totalProfit, 1000)
    assert.strictEqual(john.weekly.dealsClosed, 1)
    assert.strictEqual(john.weekly.invoices.length, 1)
    assert.strictEqual(john.weekly.invoices[0].type, 'SalesOrder')

    // Team weekly matches
    assert.strictEqual(result.teamWeekly.sales, 2500)
    assert.strictEqual(result.teamWeekly.profit, 1000)

    // Uninvoiced SO appears in active pipeline badge
    assert.strictEqual(john.activePipeline.salesOrderCount, 1)
    assert.strictEqual(john.activePipeline.salesOrderAmount, 2500)
  })

  it('shows Sales Orders invoiced before closed status and deduplicates when Invoice is present', () => {
    const invoices = [
      {
        id: 'inv-1',
        zohoId: 'inv-zoho-1',
        type: 'Invoice',
        salesperson: 'Jane Smith',
        accountName: 'Beta LLC',
        status: 'draft', // invoice status has no bearing
        date: '2026-08-18', // Tuesday (dayIdx = 1)
        amount: 5000,
        profit: 2200,
        invoiceNumber: 'INV-2001',
        linkedSalesOrderNumber: 'SO-2001'
      }
    ]

    const salesOrders = [
      {
        id: 'so-2',
        zohoId: 'so-zoho-2',
        type: 'SalesOrder',
        salesperson: 'Jane Smith',
        accountName: 'Beta LLC',
        status: 'open', // SO is still open, but invoiced
        date: '2026-08-18',
        amount: 5000,
        profit: 2200,
        salesOrderNumber: 'SO-2001',
        invoiceNumber: 'SO-2001',
        linkedInvoiceNumber: 'INV-2001'
      }
    ]

    const result = processSalesBoardDocuments({
      reps,
      invoices,
      salesOrders,
      quotes: [],
      weekDays,
      firstDayOfMonth,
      lastDayOfMonth,
      currentYear
    })

    const jane = result.reps.find((r: any) => r.id === 'user-2')
    // Correctly counted once (not double counted as 10000)
    assert.strictEqual(jane.weekly.sales[1], 5000)
    assert.strictEqual(jane.weekly.totalSales, 5000)
    assert.strictEqual(jane.weekly.totalProfit, 2200)
    assert.strictEqual(jane.weekly.dealsClosed, 1)

    // SO is recognized as invoiced, so NOT in uninvoiced pipeline
    assert.strictEqual(jane.activePipeline.salesOrderCount, 0)
    assert.strictEqual(jane.activePipeline.salesOrderAmount, 0)
  })

  it('shows Sales Order linked to an invoice when Invoice is outside query range', () => {
    const salesOrders = [
      {
        id: 'so-3',
        zohoId: 'so-zoho-3',
        type: 'SalesOrder',
        salesperson: 'John Doe',
        accountName: 'Delta Inc',
        status: 'invoiced', // SO marked invoiced
        date: '2026-08-19', // Wednesday (dayIdx = 2)
        amount: 3200,
        profit: 1400,
        salesOrderNumber: 'SO-3001',
        invoiceNumber: 'SO-3001',
        linkedInvoiceNumber: 'INV-3001' // invoice not in local fetch
      }
    ]

    const result = processSalesBoardDocuments({
      reps,
      invoices: [],
      salesOrders,
      quotes: [],
      weekDays,
      firstDayOfMonth,
      lastDayOfMonth,
      currentYear
    })

    const john = result.reps.find((r: any) => r.id === 'user-1')
    assert.strictEqual(john.weekly.sales[2], 3200)
    assert.strictEqual(john.weekly.totalSales, 3200)
    assert.strictEqual(john.weekly.totalProfit, 1400)
    assert.strictEqual(john.weekly.dealsClosed, 1)

    // Recognized as invoiced, so not in uninvoiced pipeline badge
    assert.strictEqual(john.activePipeline.salesOrderCount, 0)
  })

  it('verifies invoice status has no bearing on sales board recognition', () => {
    const invoices = [
      {
        id: 'inv-draft',
        zohoId: 'inv-z-draft',
        type: 'Invoice',
        salesperson: 'John Doe',
        accountName: 'Test Draft',
        status: 'draft',
        date: '2026-08-17',
        amount: 1000,
        profit: 400,
        invoiceNumber: 'INV-DRAFT'
      },
      {
        id: 'inv-sent',
        zohoId: 'inv-z-sent',
        type: 'Invoice',
        salesperson: 'John Doe',
        accountName: 'Test Sent',
        status: 'sent',
        date: '2026-08-18',
        amount: 1500,
        profit: 600,
        invoiceNumber: 'INV-SENT'
      },
      {
        id: 'inv-unpaid',
        zohoId: 'inv-z-unpaid',
        type: 'Invoice',
        salesperson: 'John Doe',
        accountName: 'Test Unpaid',
        status: 'unpaid',
        date: '2026-08-19',
        amount: 2000,
        profit: 800,
        invoiceNumber: 'INV-UNPAID'
      },
      {
        id: 'inv-paid',
        zohoId: 'inv-z-paid',
        type: 'Invoice',
        salesperson: 'John Doe',
        accountName: 'Test Paid',
        status: 'paid',
        date: '2026-08-20',
        amount: 2500,
        profit: 1000,
        invoiceNumber: 'INV-PAID'
      }
    ]

    const result = processSalesBoardDocuments({
      reps,
      invoices,
      salesOrders: [],
      quotes: [],
      weekDays,
      firstDayOfMonth,
      lastDayOfMonth,
      currentYear
    })

    const john = result.reps.find((r: any) => r.id === 'user-1')
    assert.strictEqual(john.weekly.totalSales, 7000)
    assert.strictEqual(john.weekly.totalProfit, 2800)
    assert.strictEqual(john.weekly.dealsClosed, 4)
  })
})
