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
  currentYear,
  referenceDate = new Date('2026-08-19T12:00:00Z')
}: {
  reps: { id: string; name: string; aliases?: string[]; payoutStructure?: string; weeklyTarget: number }[]
  invoices: any[]
  salesOrders: any[]
  quotes: any[]
  weekDays: string[]
  firstDayOfMonth: Date
  lastDayOfMonth: Date
  currentYear: number
  referenceDate?: Date
}) {
  const repsMap: Record<string, any> = {}
  reps.forEach(r => {
    repsMap[r.id] = {
      ...r,
      subtotals: {
        estimates: 0,
        estimatesCount: 0,
        salesOrders: 0,
        salesOrdersCount: 0,
        invoices: 0,
        invoicesCount: 0,
        invoicesByStatus: {
          paid: 0,
          open: 0,
          overdue: 0,
          draft: 0,
          void: 0,
          other: 0
        },
        total: 0
      },
      activePipeline: { estimateCount: 0, estimateAmount: 0, salesOrderCount: 0, salesOrderAmount: 0 },
      weekly: { 
        sales: [0,0,0,0,0], 
        profit: [0,0,0,0,0], 
        deadCostNoVig: 0, 
        deadCostSubjectToVig: 0, 
        totalSales: 0, 
        totalProfit: 0, 
        dealsClosed: 0, 
        commission: 0, 
        estimatesSubtotal: 0,
        estimatesCount: 0,
        salesOrdersSubtotal: 0,
        salesOrdersCount: 0,
        invoicesSubtotal: 0,
        invoicesCount: 0,
        invoices: [] 
      },
      mtd: { 
        sales: 0, 
        profit: 0, 
        deadCostNoVig: 0, 
        deadCostSubjectToVig: 0, 
        commission: 0, 
        dealsClosed: 0, 
        estimatesSubtotal: 0,
        estimatesCount: 0,
        salesOrdersSubtotal: 0,
        salesOrdersCount: 0,
        invoicesSubtotal: 0,
        invoicesCount: 0,
        invoices: [] 
      },
      ytd: { 
        sales: 0, 
        profit: 0, 
        deadCostNoVig: 0, 
        deadCostSubjectToVig: 0, 
        commission: 0, 
        dealsClosed: 0, 
        estimatesSubtotal: 0,
        estimatesCount: 0,
        salesOrdersSubtotal: 0,
        salesOrdersCount: 0,
        invoicesSubtotal: 0,
        invoicesCount: 0,
        invoices: [] 
      }
    }
  })

  const teamSubtotals = {
    estimates: 0,
    estimatesCount: 0,
    salesOrders: 0,
    salesOrdersCount: 0,
    invoices: 0,
    invoicesCount: 0,
    total: 0
  }

  const teamWeekly = { 
    sales: 0, 
    profit: 0, 
    deadCostNoVig: 0, 
    deadCostSubjectToVig: 0, 
    commission: 0,
    estimatesSubtotal: 0,
    salesOrdersSubtotal: 0,
    invoicesSubtotal: 0
  }

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

    const amount = Number(doc.amount || 0)
    const profit = Number(doc.profit || 0)
    const deadCostNoVig = Number(doc.deadCostNoVig || 0)
    const deadCostSubjectToVig = Number(doc.deadCostSubjectToVig || 0)

    // 1. Estimates / Quotes (48 Hours active on board or until converted to SO)
    if (docType === 'Quote') {
      const quoteDate = new Date(doc.date)
      const ageHours = (referenceDate.getTime() - quoteDate.getTime()) / (1000 * 3600)
      const isConvertedToSO = doc.isConvertedToSO || false

      // Estimates only last for 48 hours. If unconverted and <= 48h, count as active estimate subtotal.
      // If converted after 48h (or anytime), the converted SO or Invoice will represent its subtotal.
      if (!isConvertedToSO && ageHours >= 0 && ageHours <= 48) {
        if (matchedRep) {
          matchedRep.activePipeline.estimateCount += 1
          matchedRep.activePipeline.estimateAmount += amount
          matchedRep.subtotals.estimates += amount
          matchedRep.subtotals.estimatesCount += 1
          matchedRep.subtotals.total += amount
        }
        teamSubtotals.estimates += amount
        teamSubtotals.estimatesCount += 1
        teamSubtotals.total += amount

        const saleDate = doc.date ? doc.date.split('T')[0] : ''
        if (saleDate) {
          countedDocs.push(doc)
          const inCurrentWeek = weekDays.includes(saleDate)
          const isMTD = quoteDate >= firstDayOfMonth && quoteDate <= lastDayOfMonth
          const isYTD = quoteDate.getFullYear() === currentYear

          if (matchedRep) {
            if (inCurrentWeek) {
              matchedRep.weekly.estimatesSubtotal += amount
              matchedRep.weekly.estimatesCount += 1
              matchedRep.weekly.invoices.push({
                id: doc.id,
                zohoId: doc.zohoId,
                date: saleDate,
                customer: doc.accountName,
                amount,
                profit,
                deadCostNoVig,
                deadCostSubjectToVig,
                commission: 0,
                invoiceNumber: doc.invoiceNumber,
                type: 'Quote',
                status: doc.status || 'Draft'
              })
              teamWeekly.estimatesSubtotal += amount
            }
            if (isMTD) {
              matchedRep.mtd.estimatesSubtotal += amount
              matchedRep.mtd.estimatesCount += 1
              matchedRep.mtd.invoices.push({
                id: doc.id,
                zohoId: doc.zohoId,
                date: saleDate,
                customer: doc.accountName,
                amount,
                profit,
                deadCostNoVig,
                deadCostSubjectToVig,
                commission: 0,
                invoiceNumber: doc.invoiceNumber,
                type: 'Quote',
                status: doc.status || 'Draft'
              })
            }
            if (isYTD) {
              matchedRep.ytd.estimatesSubtotal += amount
              matchedRep.ytd.estimatesCount += 1
              matchedRep.ytd.invoices.push({
                id: doc.id,
                zohoId: doc.zohoId,
                date: saleDate,
                customer: doc.accountName,
                amount,
                profit,
                deadCostNoVig,
                deadCostSubjectToVig,
                commission: 0,
                invoiceNumber: doc.invoiceNumber,
                type: 'Quote',
                status: doc.status || 'Draft'
              })
            }
          }
        }
      }
      return
    }

    // 2. Sales Orders for Active Pipeline & Subtotals (Uninvoiced SOs)
    let isAlreadyAccountedByInvoice = false
    if (docType === 'SalesOrder') {
      const soStatus = (doc.status || '').toLowerCase().trim()
      const isClosedOrVoid = soStatus === 'closed' || soStatus === 'void' || soStatus === 'cancelled'
      const isLinkedToInv = doc.isLinkedToInvoice || !!(doc.linkedInvoiceId || doc.linkedInvoiceNumber) || soStatus === 'invoiced'
      
      const soId = String(doc.zohoId || doc.id || '').toLowerCase()
      const soNum = String(doc.salesOrderNumber || doc.invoiceNumber || '').toLowerCase().trim()
      const linkedInvId = String(doc.linkedInvoiceId || '').toLowerCase()
      const linkedInvNum = String(doc.linkedInvoiceNumber || '').toLowerCase().trim()

      if (soId && invoicedSOIds.has(soId)) isAlreadyAccountedByInvoice = true
      if (soNum && invoicedSONumbers.has(soNum)) isAlreadyAccountedByInvoice = true
      if (linkedInvId && processedInvoiceIds.has(linkedInvId)) isAlreadyAccountedByInvoice = true
      if (linkedInvNum && processedInvoiceNumbers.has(linkedInvNum)) isAlreadyAccountedByInvoice = true
      if (isLinkedToInv) isAlreadyAccountedByInvoice = true

      // Only count open, uninvoiced Sales Orders in Active Pipeline badge and SO subtotals
      if (!isAlreadyAccountedByInvoice && !isClosedOrVoid) {
        if (matchedRep) {
          matchedRep.activePipeline.salesOrderCount += 1
          matchedRep.activePipeline.salesOrderAmount += amount
          matchedRep.subtotals.salesOrders += amount
          matchedRep.subtotals.salesOrdersCount += 1
          matchedRep.subtotals.total += amount
        }
        teamSubtotals.salesOrders += amount
        teamSubtotals.salesOrdersCount += 1
        teamSubtotals.total += amount
      }
    }

    // 3. Invoices (Subtotals for invoices of all statuses)
    if (docType === 'Invoice') {
      const st = (doc.status || 'draft').toLowerCase().trim()
      let statusCategory = 'other'
      if (st === 'paid') statusCategory = 'paid'
      else if (st === 'open' || st === 'sent' || st === 'unpaid') statusCategory = 'open'
      else if (st === 'overdue') statusCategory = 'overdue'
      else if (st === 'draft') statusCategory = 'draft'
      else if (st === 'void' || st === 'voided' || st === 'cancelled') statusCategory = 'void'

      if (matchedRep) {
        matchedRep.subtotals.invoices += amount
        matchedRep.subtotals.invoicesCount += 1
        matchedRep.subtotals.total += amount
        if ((matchedRep.subtotals.invoicesByStatus as any)[statusCategory] !== undefined) {
          (matchedRep.subtotals.invoicesByStatus as any)[statusCategory] += amount
        }
      }
      teamSubtotals.invoices += amount
      teamSubtotals.invoicesCount += 1
      teamSubtotals.total += amount
    }

    // Deduplication: if Sales Order is already invoiced, invoice handles financial numbers
    if (docType === 'SalesOrder' && isAlreadyAccountedByInvoice) {
      return
    }

    const saleDate = doc.date ? doc.date.split('T')[0] : ''
    if (!saleDate) return

    countedDocs.push(doc)

    const invDateObj = new Date(saleDate)
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

        if (docType === 'SalesOrder') {
          matchedRep.weekly.salesOrdersSubtotal += amount
          matchedRep.weekly.salesOrdersCount += 1
          teamWeekly.salesOrdersSubtotal += amount
        } else if (docType === 'Invoice') {
          matchedRep.weekly.invoicesSubtotal += amount
          matchedRep.weekly.invoicesCount += 1
          teamWeekly.invoicesSubtotal += amount
        }

        matchedRep.weekly.invoices.push({ 
          id: doc.id, 
          zohoId: doc.zohoId,
          date: saleDate, 
          customer: doc.accountName, 
          amount, 
          profit, 
          deadCostNoVig,
          deadCostSubjectToVig,
          commission: commissionEarned, 
          invoiceNumber: doc.invoiceNumber,
          type: docType,
          status: doc.status || 'Draft'
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
        matchedRep.mtd.deadCostNoVig += deadCostNoVig
        matchedRep.mtd.deadCostSubjectToVig += deadCostSubjectToVig
        matchedRep.mtd.commission += commissionEarned
        matchedRep.mtd.dealsClosed += 1

        if (docType === 'SalesOrder') {
          matchedRep.mtd.salesOrdersSubtotal += amount
          matchedRep.mtd.salesOrdersCount += 1
        } else if (docType === 'Invoice') {
          matchedRep.mtd.invoicesSubtotal += amount
          matchedRep.mtd.invoicesCount += 1
        }

        matchedRep.mtd.invoices.push({ 
          id: doc.id, 
          zohoId: doc.zohoId,
          date: saleDate, 
          customer: doc.accountName, 
          amount, 
          profit, 
          deadCostNoVig,
          deadCostSubjectToVig,
          commission: commissionEarned, 
          invoiceNumber: doc.invoiceNumber,
          type: docType,
          status: doc.status || 'Draft'
        })
      }

      if (isYTD) {
        matchedRep.ytd.sales += amount
        matchedRep.ytd.profit += profit
        matchedRep.ytd.deadCostNoVig += deadCostNoVig
        matchedRep.ytd.deadCostSubjectToVig += deadCostSubjectToVig
        matchedRep.ytd.commission += commissionEarned
        matchedRep.ytd.dealsClosed += 1

        if (docType === 'SalesOrder') {
          matchedRep.ytd.salesOrdersSubtotal += amount
          matchedRep.ytd.salesOrdersCount += 1
        } else if (docType === 'Invoice') {
          matchedRep.ytd.invoicesSubtotal += amount
          matchedRep.ytd.invoicesCount += 1
        }

        matchedRep.ytd.invoices.push({ 
          id: doc.id, 
          zohoId: doc.zohoId,
          date: saleDate, 
          customer: doc.accountName, 
          amount, 
          profit, 
          deadCostNoVig,
          deadCostSubjectToVig,
          commission: commissionEarned, 
          invoiceNumber: doc.invoiceNumber,
          type: docType,
          status: doc.status || 'Draft'
        })
      }
    }
  })

  return { reps: Object.values(repsMap), teamWeekly, teamSubtotals, countedDocs }
}

describe('Sales Board Calculations - Estimates, Uninvoiced SOs, Invoices of All Statuses', () => {
  const weekDays = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']
  const firstDayOfMonth = new Date(2026, 7, 1)
  const lastDayOfMonth = new Date(2026, 7, 31)
  const currentYear = 2026
  const referenceDate = new Date('2026-08-19T12:00:00Z')

  const reps = [
    { id: 'user-1', name: 'John Doe', weeklyTarget: 10000 },
    { id: 'user-2', name: 'Jane Smith', weeklyTarget: 10000 }
  ]

  it('shows subtotals for estimates that haven not been converted to a sales order within 48 hours', () => {
    const quotes = [
      {
        id: 'quote-1',
        zohoId: 'q-zoho-1',
        type: 'Quote',
        salesperson: 'John Doe',
        accountName: 'Active Estimate Co',
        status: 'draft',
        date: '2026-08-18T10:00:00Z', // ~26 hours old (< 48 hours)
        amount: 3500,
        profit: 1400,
        invoiceNumber: 'EST-1001',
        isConvertedToSO: false
      }
    ]

    const result = processSalesBoardDocuments({
      reps,
      invoices: [],
      salesOrders: [],
      quotes,
      weekDays,
      firstDayOfMonth,
      lastDayOfMonth,
      currentYear,
      referenceDate
    })

    const john = result.reps.find((r: any) => r.id === 'user-1')
    assert.strictEqual(john.subtotals.estimates, 3500)
    assert.strictEqual(john.subtotals.estimatesCount, 1)
    assert.strictEqual(john.subtotals.total, 3500)
    assert.strictEqual(john.activePipeline.estimateCount, 1)
    assert.strictEqual(john.activePipeline.estimateAmount, 3500)
    assert.strictEqual(result.teamSubtotals.estimates, 3500)
    assert.strictEqual(result.teamSubtotals.total, 3500)
    assert.strictEqual(john.weekly.estimatesSubtotal, 3500)
    assert.strictEqual(john.weekly.invoices.length, 1)
    assert.strictEqual(john.weekly.invoices[0].type, 'Quote')
  })

  it('excludes estimates older than 48 hours when not converted to a sales order', () => {
    const quotes = [
      {
        id: 'quote-expired',
        zohoId: 'q-zoho-exp',
        type: 'Quote',
        salesperson: 'John Doe',
        accountName: 'Old Quote Inc',
        status: 'draft',
        date: '2026-08-16T10:00:00Z', // ~74 hours old (> 48 hours)
        amount: 8000,
        profit: 3200,
        invoiceNumber: 'EST-OLD',
        isConvertedToSO: false
      }
    ]

    const result = processSalesBoardDocuments({
      reps,
      invoices: [],
      salesOrders: [],
      quotes,
      weekDays,
      firstDayOfMonth,
      lastDayOfMonth,
      currentYear,
      referenceDate
    })

    const john = result.reps.find((r: any) => r.id === 'user-1')
    assert.strictEqual(john.subtotals.estimates, 0)
    assert.strictEqual(john.subtotals.estimatesCount, 0)
    assert.strictEqual(john.activePipeline.estimateCount, 0)
    assert.strictEqual(result.teamSubtotals.estimates, 0)
  })

  it('shows SO subtotal if estimate is converted after 48 hours', () => {
    const quotes = [
      {
        id: 'quote-converted-late',
        zohoId: 'q-zoho-late',
        type: 'Quote',
        salesperson: 'Jane Smith',
        accountName: 'Late Converted Corp',
        status: 'converted',
        date: '2026-08-10T10:00:00Z', // 9 days old (> 48 hours)
        amount: 6000,
        profit: 2400,
        invoiceNumber: 'EST-LATE',
        isConvertedToSO: true
      }
    ]

    const salesOrders = [
      {
        id: 'so-late',
        zohoId: 'so-zoho-late',
        type: 'SalesOrder',
        salesperson: 'Jane Smith',
        accountName: 'Late Converted Corp',
        status: 'confirmed',
        date: '2026-08-18', // Tuesday
        amount: 6000,
        profit: 2400,
        salesOrderNumber: 'SO-LATE',
        invoiceNumber: 'SO-LATE'
      }
    ]

    const result = processSalesBoardDocuments({
      reps,
      invoices: [],
      salesOrders,
      quotes,
      weekDays,
      firstDayOfMonth,
      lastDayOfMonth,
      currentYear,
      referenceDate
    })

    const jane = result.reps.find((r: any) => r.id === 'user-2')
    // Quote is marked converted, so estimate subtotal is 0
    assert.strictEqual(jane.subtotals.estimates, 0)
    // Converted SO accounts for the subtotal
    assert.strictEqual(jane.subtotals.salesOrders, 6000)
    assert.strictEqual(jane.subtotals.total, 6000)
    assert.strictEqual(jane.weekly.totalSales, 6000)
    assert.strictEqual(jane.weekly.sales[1], 6000)
    assert.strictEqual(jane.weekly.invoices[0].type, 'SalesOrder')
  })

  it('shows subtotals for uninvoiced sales orders and updates daily grid', () => {
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
      currentYear,
      referenceDate
    })

    const john = result.reps.find((r: any) => r.id === 'user-1')
    assert.strictEqual(john.weekly.sales[0], 2500)
    assert.strictEqual(john.weekly.profit[0], 1000)
    assert.strictEqual(john.weekly.totalSales, 2500)
    assert.strictEqual(john.weekly.totalProfit, 1000)
    assert.strictEqual(john.weekly.dealsClosed, 1)
    assert.strictEqual(john.subtotals.salesOrders, 2500)
    assert.strictEqual(john.subtotals.salesOrdersCount, 1)
    assert.strictEqual(john.subtotals.total, 2500)

    // Team weekly matches
    assert.strictEqual(result.teamWeekly.sales, 2500)
    assert.strictEqual(result.teamWeekly.profit, 1000)
    assert.strictEqual(result.teamSubtotals.salesOrders, 2500)
    assert.strictEqual(result.teamSubtotals.total, 2500)

    // Uninvoiced SO appears in active pipeline badge
    assert.strictEqual(john.activePipeline.salesOrderCount, 1)
    assert.strictEqual(john.activePipeline.salesOrderAmount, 2500)
  })

  it('shows subtotals for invoices of all statuses (paid, open, overdue, sent, draft, void)', () => {
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
        id: 'inv-overdue',
        zohoId: 'inv-z-overdue',
        type: 'Invoice',
        salesperson: 'John Doe',
        accountName: 'Test Overdue',
        status: 'overdue',
        date: '2026-08-19',
        amount: 2000,
        profit: 800,
        invoiceNumber: 'INV-OVERDUE'
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
      },
      {
        id: 'inv-void',
        zohoId: 'inv-z-void',
        type: 'Invoice',
        salesperson: 'John Doe',
        accountName: 'Test Void',
        status: 'void',
        date: '2026-08-21',
        amount: 3000,
        profit: 1200,
        invoiceNumber: 'INV-VOID'
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
      currentYear,
      referenceDate
    })

    const john = result.reps.find((r: any) => r.id === 'user-1')
    assert.strictEqual(john.subtotals.invoices, 10000)
    assert.strictEqual(john.subtotals.invoicesCount, 5)
    assert.strictEqual(john.subtotals.invoicesByStatus.draft, 1000)
    assert.strictEqual(john.subtotals.invoicesByStatus.open, 1500)
    assert.strictEqual(john.subtotals.invoicesByStatus.overdue, 2000)
    assert.strictEqual(john.subtotals.invoicesByStatus.paid, 2500)
    assert.strictEqual(john.subtotals.invoicesByStatus.void, 3000)
    assert.strictEqual(john.subtotals.total, 10000)
    assert.strictEqual(result.teamSubtotals.invoices, 10000)
  })

  it('renders and aggregates cleanly when there is NO invoice data (0 invoices)', () => {
    const quotes = [
      {
        id: 'quote-active',
        zohoId: 'q-zoho-act',
        type: 'Quote',
        salesperson: 'John Doe',
        accountName: 'New Deal Co',
        status: 'open',
        date: '2026-08-19T08:00:00Z',
        amount: 4200,
        profit: 1700,
        invoiceNumber: 'EST-4200',
        isConvertedToSO: false
      }
    ]

    const salesOrders = [
      {
        id: 'so-open',
        zohoId: 'so-zoho-op',
        type: 'SalesOrder',
        salesperson: 'Jane Smith',
        accountName: 'Pending Order LLC',
        status: 'open',
        date: '2026-08-19',
        amount: 5800,
        profit: 2300,
        salesOrderNumber: 'SO-5800',
        invoiceNumber: 'SO-5800'
      }
    ]

    const result = processSalesBoardDocuments({
      reps,
      invoices: [], // Zero invoices
      salesOrders,
      quotes,
      weekDays,
      firstDayOfMonth,
      lastDayOfMonth,
      currentYear,
      referenceDate
    })

    assert.strictEqual(result.reps.length, 2)
    const john = result.reps.find((r: any) => r.id === 'user-1')
    const jane = result.reps.find((r: any) => r.id === 'user-2')

    assert.strictEqual(john.subtotals.estimates, 4200)
    assert.strictEqual(john.subtotals.salesOrders, 0)
    assert.strictEqual(john.subtotals.invoices, 0)
    assert.strictEqual(john.subtotals.total, 4200)

    assert.strictEqual(jane.subtotals.estimates, 0)
    assert.strictEqual(jane.subtotals.salesOrders, 5800)
    assert.strictEqual(jane.subtotals.invoices, 0)
    assert.strictEqual(jane.subtotals.total, 5800)

    assert.strictEqual(result.teamSubtotals.estimates, 4200)
    assert.strictEqual(result.teamSubtotals.salesOrders, 5800)
    assert.strictEqual(result.teamSubtotals.invoices, 0)
    assert.strictEqual(result.teamSubtotals.total, 10000)
  })

  it('deduplicates properly across converted Quotes -> Sales Orders -> Invoices', () => {
    const invoices = [
      {
        id: 'inv-full',
        zohoId: 'inv-z-full',
        type: 'Invoice',
        salesperson: 'John Doe',
        accountName: 'Full Pipeline Corp',
        status: 'open',
        date: '2026-08-18',
        amount: 7500,
        profit: 3000,
        invoiceNumber: 'INV-7500',
        linkedSalesOrderNumber: 'SO-7500'
      }
    ]

    const salesOrders = [
      {
        id: 'so-full',
        zohoId: 'so-z-full',
        type: 'SalesOrder',
        salesperson: 'John Doe',
        accountName: 'Full Pipeline Corp',
        status: 'invoiced',
        date: '2026-08-18',
        amount: 7500,
        profit: 3000,
        salesOrderNumber: 'SO-7500',
        invoiceNumber: 'SO-7500',
        linkedInvoiceNumber: 'INV-7500'
      }
    ]

    const quotes = [
      {
        id: 'quote-full',
        zohoId: 'q-z-full',
        type: 'Quote',
        salesperson: 'John Doe',
        accountName: 'Full Pipeline Corp',
        status: 'converted',
        date: '2026-08-18T09:00:00Z',
        amount: 7500,
        profit: 3000,
        invoiceNumber: 'EST-7500',
        isConvertedToSO: true
      }
    ]

    const result = processSalesBoardDocuments({
      reps,
      invoices,
      salesOrders,
      quotes,
      weekDays,
      firstDayOfMonth,
      lastDayOfMonth,
      currentYear,
      referenceDate
    })

    const john = result.reps.find((r: any) => r.id === 'user-1')
    assert.strictEqual(john.weekly.totalSales, 7500)
    assert.strictEqual(john.weekly.totalProfit, 3000)
    assert.strictEqual(john.weekly.dealsClosed, 1)
    // Subtotals categorization:
    assert.strictEqual(john.subtotals.estimates, 0) // converted, so 0
    assert.strictEqual(john.subtotals.salesOrders, 0) // invoiced, so 0 in open SOs
    assert.strictEqual(john.subtotals.invoices, 7500) // invoice accounts for it
    assert.strictEqual(john.subtotals.total, 7500)
  })

  it('correctly aggregates all three pipeline components (48h Estimates, Uninvoiced Sales Orders, and Invoices) simultaneously for Live Weekly Subtotal & Financial Performance', () => {
    // 1. Active 48h estimate (<48 hours, unconverted)
    const quotes = [
      {
        id: 'quote-p1',
        zohoId: 'q-p1',
        type: 'Quote',
        salesperson: 'John Doe',
        accountName: 'Pipeline Alpha',
        status: 'draft',
        date: '2026-08-19T06:00:00Z', // 6 hours old (< 48h)
        amount: 3000,
        profit: 1200,
        invoiceNumber: 'EST-101',
        isConvertedToSO: false
      }
    ]

    // 2. Uninvoiced Sales Order
    const salesOrders = [
      {
        id: 'so-p2',
        zohoId: 'so-p2',
        type: 'SalesOrder',
        salesperson: 'John Doe',
        accountName: 'Pipeline Beta',
        status: 'open',
        date: '2026-08-18', // Tuesday
        amount: 4500,
        profit: 1800,
        salesOrderNumber: 'SO-102',
        invoiceNumber: 'SO-102',
        isLinkedToInvoice: false
      }
    ]

    // 3. Invoice
    const invoices = [
      {
        id: 'inv-p3',
        zohoId: 'inv-p3',
        type: 'Invoice',
        salesperson: 'John Doe',
        accountName: 'Pipeline Gamma',
        status: 'paid',
        date: '2026-08-17', // Monday
        amount: 6000,
        profit: 2400,
        invoiceNumber: 'INV-103'
      }
    ]

    const result = processSalesBoardDocuments({
      reps,
      invoices,
      salesOrders,
      quotes,
      weekDays,
      firstDayOfMonth,
      lastDayOfMonth,
      currentYear,
      referenceDate
    })

    const john = result.reps.find((r: any) => r.id === 'user-1')
    assert.ok(john)

    // Verify John's individual subtotals have all three components
    assert.strictEqual(john.subtotals.estimates, 3000)
    assert.strictEqual(john.subtotals.estimatesCount, 1)
    assert.strictEqual(john.subtotals.salesOrders, 4500)
    assert.strictEqual(john.subtotals.salesOrdersCount, 1)
    assert.strictEqual(john.subtotals.invoices, 6000)
    assert.strictEqual(john.subtotals.invoicesCount, 1)
    assert.strictEqual(john.subtotals.total, 3000 + 4500 + 6000) // 13,500

    // Verify Active Pipeline metrics
    assert.strictEqual(john.activePipeline.estimateCount, 1)
    assert.strictEqual(john.activePipeline.estimateAmount, 3000)
    assert.strictEqual(john.activePipeline.salesOrderCount, 1)
    assert.strictEqual(john.activePipeline.salesOrderAmount, 4500)

    // Verify Team subtotals contain all three pipeline components
    assert.strictEqual(result.teamSubtotals.estimates, 3000)
    assert.strictEqual(result.teamSubtotals.estimatesCount, 1)
    assert.strictEqual(result.teamSubtotals.salesOrders, 4500)
    assert.strictEqual(result.teamSubtotals.salesOrdersCount, 1)
    assert.strictEqual(result.teamSubtotals.invoices, 6000)
    assert.strictEqual(result.teamSubtotals.invoicesCount, 1)
    assert.strictEqual(result.teamSubtotals.total, 13500)

    // Verify Weekly performance financial totals
    assert.strictEqual(john.weekly.sales[0], 6000) // Monday Invoice
    assert.strictEqual(john.weekly.sales[1], 4500) // Tuesday Sales Order
    assert.strictEqual(john.weekly.estimatesSubtotal, 3000) // Estimates subtotal tracked in weekly pipeline
    assert.strictEqual(john.weekly.totalSales, 10500) // Invoices + Sales Orders in daily grid
    assert.strictEqual(john.weekly.totalProfit, 1800 + 2400) // 4,200 (SO + Inv profit)
    assert.strictEqual(result.teamWeekly.sales, 10500)
    assert.strictEqual(result.teamWeekly.profit, 4200)
  })
})
