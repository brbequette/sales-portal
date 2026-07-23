"use client"
import { useState, useMemo } from "react"
import { FiPrinter, FiX, FiDollarSign, FiCalendar, FiTrendingUp, FiAward, FiCheckCircle, FiLayers } from "react-icons/fi"

interface InvoiceRecord {
  id: string
  zohoId: string
  invoiceNumber: string | null
  name: string
  amount: number
  profit: number
  deadCost: number
  status: string
  isPaid: boolean
  issueDate: string | null
  paymentDate: string | null
  commission: { total: number; upfront: number; final: number }
  accountName: string
}

interface Payout {
  id: string
  amount: number
  date: string
  notes?: string
}

interface RepSummary {
  repId: string
  repName: string
  invoices: InvoiceRecord[]
  payouts: Payout[]
  totalEarned: number
  totalPaid: number
  totalProfit: number
  totalSales: number
  balance: number
}

interface PayPeriodStatementModalProps {
  rep: RepSummary
  onClose: () => void
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0)
}

function fmtDate(s: string | null) {
  if (!s) return "--"
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function PayPeriodStatementModal({ rep, onClose }: PayPeriodStatementModalProps) {
  // Generate all weekly pay period options from rep's invoices & payouts
  const payPeriodOptions = useMemo(() => {
    const dates: Date[] = []
    rep.invoices.forEach(inv => {
      if (inv.issueDate) dates.push(new Date(inv.issueDate))
      if (inv.paymentDate) dates.push(new Date(inv.paymentDate))
    })
    rep.payouts.forEach(p => dates.push(new Date(p.date)))

    if (dates.length === 0) dates.push(new Date())

    const weekStarts = new Set<string>()
    dates.forEach(d => {
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const weekStart = new Date(d)
      weekStart.setDate(diff)
      weekStart.setHours(0, 0, 0, 0)
      weekStarts.add(weekStart.toISOString().split('T')[0])
    })

    return Array.from(weekStarts).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  }, [rep])

  // Snap any date to its Monday (week start)
  function toMondayStr(dateStr: string): string {
    const d = new Date(dateStr)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)
    return monday.toISOString().split('T')[0]
  }

  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(payPeriodOptions[0] || toMondayStr(new Date().toISOString().split('T')[0]))

  // Calculate Pay Period Range
  const periodStart = useMemo(() => new Date(selectedWeekStart), [selectedWeekStart])
  const periodEnd = useMemo(() => {
    const d = new Date(periodStart)
    d.setDate(d.getDate() + 6)
    d.setHours(23, 59, 59, 999)
    return d
  }, [periodStart])

  // 1. Upfront 1st Half Invoices (Created in period)
  const upfrontInvoices = useMemo(() => {
    return rep.invoices.filter(inv => {
      if (!inv.issueDate) return false
      const d = new Date(inv.issueDate)
      return d >= periodStart && d <= periodEnd
    })
  }, [rep.invoices, periodStart, periodEnd])

  // 2. Final 2nd Half Invoices (Paid in period)
  const finalInvoices = useMemo(() => {
    return rep.invoices.filter(inv => {
      if (!inv.isPaid || !inv.paymentDate) return false
      const d = new Date(inv.paymentDate)
      return d >= periodStart && d <= periodEnd
    })
  }, [rep.invoices, periodStart, periodEnd])

  // 3. Payouts issued in period
  const periodPayouts = useMemo(() => {
    return rep.payouts.filter(p => {
      const d = new Date(p.date)
      return d >= periodStart && d <= periodEnd
    })
  }, [rep.payouts, periodStart, periodEnd])

  // Totals for this pay period
  const totalUpfront = upfrontInvoices.reduce((sum, inv) => sum + inv.commission.upfront, 0)
  const totalFinal = finalInvoices.reduce((sum, inv) => sum + inv.commission.final, 0)
  const totalPeriodEarned = totalUpfront + totalFinal
  const totalPeriodPayouts = periodPayouts.reduce((sum, p) => sum + p.amount, 0)
  const periodNetCheck = totalPeriodEarned - totalPeriodPayouts

  // YTD Metrics
  const ytdSales = rep.totalSales || 0
  const ytdProfit = rep.totalProfit || 0
  const ytdEarned = rep.totalEarned || 0
  const ytdPaid = rep.totalPaid || 0
  const ytdBalance = rep.balance || 0

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      
      {/* Container */}
      <div className="bg-[#0f1012] text-white border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col print:bg-white print:text-black print:border-none print:shadow-none print:max-w-none print:w-full print:h-auto">
        
        {/* Modal Top Controls (Hidden when printing) */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 print:hidden bg-neutral-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FiDollarSign size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white">Pay Period Statement & Check Stub</h2>
              <p className="text-xs text-neutral-400 font-semibold">{rep.repName} - Commission Statement</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick-pick: weeks with activity */}
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider px-1">Quick Pick</label>
              <select
                value={payPeriodOptions.includes(selectedWeekStart) ? selectedWeekStart : ''}
                onChange={e => { if (e.target.value) setSelectedWeekStart(e.target.value) }}
                className="bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-emerald-500 max-w-[180px]"
              >
                {!payPeriodOptions.includes(selectedWeekStart) && (
                  <option value="">-- Custom Date --</option>
                )}
                {payPeriodOptions.map(ws => (
                  <option key={ws} value={ws}>
                    Week of {fmtDate(ws)}
                  </option>
                ))}
              </select>
            </div>

            {/* Free-form date picker — snaps to Monday of chosen week */}
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider px-1">Any Week</label>
              <input
                type="date"
                value={selectedWeekStart}
                onChange={e => {
                  if (e.target.value) setSelectedWeekStart(toMondayStr(e.target.value))
                }}
                className="bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
              />
            </div>

            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg hover:scale-105 active:scale-95"
            >
              <FiPrinter size={16} /> Print Pay Stub
            </button>

            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              <FiX size={20} />
            </button>
          </div>
        </div>

        {/* Printable Pay Stub Statement View */}
        <div className="p-8 space-y-8 print:p-0 print:space-y-6">
          
          {/* Statement Header */}
          <div className="flex items-start justify-between border-b border-white/10 pb-6 print:border-black/20">
            <div>
              <div className="text-2xl font-black tracking-tight text-white print:text-black">
                TITAN DIAMOND LLC
              </div>
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mt-0.5 print:text-emerald-700">
                Sales Rep Commission Statement & Check Stub
              </div>
              <div className="text-xs text-neutral-400 mt-2 print:text-black/70">
                <span className="font-bold">Salesperson:</span> {rep.repName}
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider print:text-black/60">
                Pay Period Range
              </div>
              <div className="text-sm font-black text-white print:text-black font-mono mt-0.5">
                {fmtDate(periodStart.toISOString())} - {fmtDate(periodEnd.toISOString())}
              </div>
              <div className="text-[11px] text-neutral-500 print:text-black/60 mt-1 font-semibold">
                Statement Date: {fmtDate(new Date().toISOString())}
              </div>
            </div>
          </div>

          {/* Pay Period Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
            
            <div className="bg-neutral-900/60 p-4 rounded-xl border border-white/10 print:border-black/20 print:bg-gray-50">
              <div className="text-[10px] font-black uppercase text-amber-400 print:text-black/60 tracking-wider">
                1st Half (Upfront 25%)
              </div>
              <div className="text-lg font-mono font-bold text-amber-300 print:text-black mt-1">
                {fmt(totalUpfront)}
              </div>
              <div className="text-[10px] text-neutral-500 print:text-black/60 mt-0.5">
                {upfrontInvoices.length} New Invoices
              </div>
            </div>

            <div className="bg-neutral-900/60 p-4 rounded-xl border border-white/10 print:border-black/20 print:bg-gray-50">
              <div className="text-[10px] font-black uppercase text-emerald-400 print:text-black/60 tracking-wider">
                2nd Half (Paid 25%)
              </div>
              <div className="text-lg font-mono font-bold text-emerald-300 print:text-black mt-1">
                {fmt(totalFinal)}
              </div>
              <div className="text-[10px] text-neutral-500 print:text-black/60 mt-0.5">
                {finalInvoices.length} Paid Settlement Invoices
              </div>
            </div>

            <div className="bg-neutral-900/60 p-4 rounded-xl border border-white/10 print:border-black/20 print:bg-gray-50">
              <div className="text-[10px] font-black uppercase text-cyan-400 print:text-black/60 tracking-wider">
                Payouts & Draws
              </div>
              <div className="text-lg font-mono font-bold text-cyan-300 print:text-black mt-1">
                {fmt(totalPeriodPayouts)}
              </div>
              <div className="text-[10px] text-neutral-500 print:text-black/60 mt-0.5">
                {periodPayouts.length} Payout Events
              </div>
            </div>

            <div className="bg-emerald-950/40 p-4 rounded-xl border border-emerald-500/30 print:border-black/30 print:bg-gray-100">
              <div className="text-[10px] font-black uppercase text-emerald-400 print:text-black tracking-wider">
                Net Check Amount Due
              </div>
              <div className="text-xl font-mono font-black text-emerald-400 print:text-black mt-1">
                {fmt(periodNetCheck)}
              </div>
              <div className="text-[10px] text-emerald-300/80 print:text-black/70 mt-0.5 font-bold">
                Current Pay Period Balance
              </div>
            </div>

          </div>

          {/* Itemized 1st Half Upfront Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-amber-400 print:text-black flex items-center gap-1.5">
              <FiLayers /> 1. First Half Upfront Commissions (New Invoices Created)
            </h3>

            {upfrontInvoices.length === 0 ? (
              <div className="p-4 bg-neutral-900/30 rounded-xl border border-white/5 text-xs text-neutral-500 text-center font-medium print:border-black/10">
                No new invoices issued during this pay period.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-sans border border-white/10 rounded-xl overflow-hidden print:border-black/20">
                <thead className="bg-white/5 text-neutral-400 print:text-black print:bg-gray-100 uppercase font-black tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-4">Invoice #</th>
                    <th className="py-2.5 px-4">Account Name</th>
                    <th className="py-2.5 px-4">Issue Date</th>
                    <th className="py-2.5 px-4 text-right">Subtotal</th>
                    <th className="py-2.5 px-4 text-right">Est. Profit</th>
                    <th className="py-2.5 px-4 text-right">1st Half Upfront (25%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-neutral-200 print:divide-black/10 print:text-black font-mono text-[11px]">
                  {upfrontInvoices.map(inv => {
                    const raw = (inv as any).raw || {}
                    const rawItems = (inv as any).items || raw.items || {}
                    const lineItems: any[] = Array.isArray(rawItems.line_items) ? rawItems.line_items : (Array.isArray(rawItems) ? rawItems : [])

                    return (
                      <>
                        <tr key={inv.id} className="bg-white/[0.02] print:bg-gray-50">
                          <td className="py-2.5 px-4 font-bold text-white print:text-black">
                            {inv.invoiceNumber ? `INV-${inv.invoiceNumber}` : inv.zohoId}
                          </td>
                          <td className="py-2.5 px-4 font-sans font-semibold text-neutral-300 print:text-black">
                            {inv.accountName}
                          </td>
                          <td className="py-2.5 px-4 text-neutral-400 print:text-black">
                            {fmtDate(inv.issueDate)}
                          </td>
                          <td className="py-2.5 px-4 text-right text-neutral-300 print:text-black">
                            {fmt(inv.amount)}
                          </td>
                          <td className="py-2.5 px-4 text-right text-sky-300 print:text-black font-bold">
                            {fmt(inv.profit)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-black text-amber-300 print:text-black">
                            {fmt(inv.commission.upfront)}
                          </td>
                        </tr>

                        {/* Nested Line Items Breakdown */}
                        {lineItems.length > 0 && (
                          <tr key={`${inv.id}-items`} className="bg-black/30 print:bg-gray-100/50">
                            <td colSpan={6} className="px-6 py-2">
                              <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1 print:text-black/60">
                                Line Item Breakdown ({lineItems.length} Products):
                              </div>
                              <div className="space-y-1">
                                {lineItems.map((item, idx) => {
                                  const qty = parseFloat(item.quantity || 1)
                                  const rate = parseFloat(item.rate || 0)
                                  const cost = parseFloat(item.purchase_rate || item.pricebook_rate || 0)
                                  const lineTotal = qty * rate
                                  const lineDeadCost = qty * cost

                                  return (
                                    <div key={idx} className="flex items-center justify-between text-[11px] font-mono text-neutral-300 print:text-black/80 pl-3 border-l-2 border-amber-500/40">
                                      <span className="font-sans font-medium text-neutral-200 print:text-black">
                                        {qty}x {item.sku ? `[${item.sku}] ` : ''}{item.name}
                                      </span>
                                      <div className="flex items-center gap-4">
                                        <span>Rate: ${rate.toFixed(2)}</span>
                                        <span>Cost: ${cost.toFixed(2)}</span>
                                        <span>Dead Cost: ${lineDeadCost.toFixed(2)}</span>
                                        <span className="font-bold text-amber-300 print:text-black">${lineTotal.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Itemized 2nd Half Final Settlement Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 print:text-black flex items-center gap-1.5">
              <FiCheckCircle /> 2. Second Half Final Commissions (Invoices Paid & CC Fees Reconciled)
            </h3>

            {finalInvoices.length === 0 ? (
              <div className="p-4 bg-neutral-900/30 rounded-xl border border-white/5 text-xs text-neutral-500 text-center font-medium print:border-black/10">
                No invoices paid/settled during this pay period.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-sans border border-white/10 rounded-xl overflow-hidden print:border-black/20">
                <thead className="bg-white/5 text-neutral-400 print:text-black print:bg-gray-100 uppercase font-black tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-4">Invoice #</th>
                    <th className="py-2.5 px-4">Account Name</th>
                    <th className="py-2.5 px-4">Payment Date</th>
                    <th className="py-2.5 px-4 text-right">Subtotal</th>
                    <th className="py-2.5 px-4 text-right">Final Profit</th>
                    <th className="py-2.5 px-4 text-right">2nd Half Final (Balance)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-neutral-200 print:divide-black/10 print:text-black font-mono text-[11px]">
                  {finalInvoices.map(inv => {
                    const raw = (inv as any).raw || {}
                    const rawItems = (inv as any).items || raw.items || {}
                    const lineItems: any[] = Array.isArray(rawItems.line_items) ? rawItems.line_items : (Array.isArray(rawItems) ? rawItems : [])

                    return (
                      <>
                        <tr key={inv.id} className="bg-white/[0.02] print:bg-gray-50">
                          <td className="py-2.5 px-4 font-bold text-white print:text-black">
                            {inv.invoiceNumber ? `INV-${inv.invoiceNumber}` : inv.zohoId}
                          </td>
                          <td className="py-2.5 px-4 font-sans font-semibold text-neutral-300 print:text-black">
                            {inv.accountName}
                          </td>
                          <td className="py-2.5 px-4 text-neutral-400 print:text-black">
                            {fmtDate(inv.paymentDate)}
                          </td>
                          <td className="py-2.5 px-4 text-right text-neutral-300 print:text-black">
                            {fmt(inv.amount)}
                          </td>
                          <td className="py-2.5 px-4 text-right text-sky-300 print:text-black font-bold">
                            {fmt(inv.profit)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-black text-emerald-300 print:text-black">
                            {fmt(inv.commission.final)}
                          </td>
                        </tr>

                        {/* Nested Line Items Breakdown */}
                        {lineItems.length > 0 && (
                          <tr key={`${inv.id}-items`} className="bg-black/30 print:bg-gray-100/50">
                            <td colSpan={6} className="px-6 py-2">
                              <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1 print:text-black/60">
                                Line Item Breakdown ({lineItems.length} Products):
                              </div>
                              <div className="space-y-1">
                                {lineItems.map((item, idx) => {
                                  const qty = parseFloat(item.quantity || 1)
                                  const rate = parseFloat(item.rate || 0)
                                  const cost = parseFloat(item.purchase_rate || item.pricebook_rate || 0)
                                  const lineTotal = qty * rate
                                  const lineDeadCost = qty * cost

                                  return (
                                    <div key={idx} className="flex items-center justify-between text-[11px] font-mono text-neutral-300 print:text-black/80 pl-3 border-l-2 border-emerald-500/40">
                                      <span className="font-sans font-medium text-neutral-200 print:text-black">
                                        {qty}x {item.sku ? `[${item.sku}] ` : ''}{item.name}
                                      </span>
                                      <div className="flex items-center gap-4">
                                        <span>Rate: ${rate.toFixed(2)}</span>
                                        <span>Cost: ${cost.toFixed(2)}</span>
                                        <span>Dead Cost: ${lineDeadCost.toFixed(2)}</span>
                                        <span className="font-bold text-emerald-300 print:text-black">${lineTotal.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* YTD Summaries & Goal Totals Footer */}
          <div className="border-t border-white/10 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 print:border-black/20 print:grid-cols-2">
            
            {/* YTD Totals */}
            <div className="bg-neutral-900/40 p-5 rounded-2xl border border-white/10 print:border-black/20 print:bg-white space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-neutral-400 print:text-black flex items-center gap-1.5">
                <FiTrendingUp /> Year-to-Date (YTD) Totals
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2">
                <div>
                  <span className="text-neutral-500 print:text-black/60 block text-[10px]">YTD Sales Revenue</span>
                  <span className="text-white print:text-black font-bold">{fmt(ytdSales)}</span>
                </div>
                <div>
                  <span className="text-neutral-500 print:text-black/60 block text-[10px]">YTD Dead Profit</span>
                  <span className="text-amber-300 print:text-black font-bold">{fmt(ytdProfit)}</span>
                </div>
                <div>
                  <span className="text-neutral-500 print:text-black/60 block text-[10px]">YTD Total Earned</span>
                  <span className="text-emerald-400 print:text-black font-bold">{fmt(ytdEarned)}</span>
                </div>
                <div>
                  <span className="text-neutral-500 print:text-black/60 block text-[10px]">YTD Total Paid</span>
                  <span className="text-cyan-300 print:text-black font-bold">{fmt(ytdPaid)}</span>
                </div>
              </div>
            </div>

            {/* Check Stub Sign-off */}
            <div className="bg-neutral-900/40 p-5 rounded-2xl border border-white/10 print:border-black/20 print:bg-white flex flex-col justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-emerald-400 print:text-black flex items-center gap-1.5">
                  <FiAward /> Check Stub Authorization
                </div>
                <p className="text-[11px] text-neutral-400 print:text-black/70 mt-1">
                  Enclosed check or direct deposit includes the net pay period commission balance outlined above.
                </p>
              </div>

              <div className="pt-4 flex items-end justify-between font-mono text-xs border-t border-white/10 print:border-black/20">
                <span className="text-neutral-400 print:text-black font-bold">Net Check Amount:</span>
                <span className="text-lg font-black text-emerald-400 print:text-black">{fmt(periodNetCheck)}</span>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  )
}
