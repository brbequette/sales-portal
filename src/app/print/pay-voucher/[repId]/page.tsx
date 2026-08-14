"use client"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0)
}

function fmtDate(s: string | null) {
  if (!s) return "--"
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function PayVoucherPrint({ params }: { params: { repId: string } }) {
  const searchParams = useSearchParams()
  const weekStartStr = searchParams.get("weekStart") // Format: YYYY-MM-DD
  const { repId } = params

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  
  useEffect(() => {
    if (!weekStartStr || !repId) return

    const fetchData = async () => {
      setLoading(true)
      try {
        const year = weekStartStr.split("-")[0]
        const [usersRes, commRes, advRes, reimRes, planRes, basePayRes] = await Promise.all([
          fetch("/api/admin/users"),
          fetch(`/api/get-commissions?year=${year}&includeHidden=true`),
          fetch(`/api/manage-advances?userId=${repId}`),
          fetch(`/api/manage-reimbursements?userId=${repId}`),
          fetch(`/api/compensation-plans?repId=${repId}&status=ACTIVE`),
          fetch(`/api/base-pay-earnings?repId=${repId}`),
        ])
        
        const users = await usersRes.json()
        const commData = await commRes.json()
        const advData = await advRes.json()
        const reimData = await reimRes.json()
        const planData = await planRes.json()
        const basePayData = await basePayRes.json()

        const repName = users.users?.find((u: any) => u.id === repId)?.name || "Unknown Rep"
        
        // Active compensation plan
        const activePlan = planData.success && planData.data?.length > 0 ? planData.data[0] : null
        
        // Filter invoices for this week
        const repData = commData.byRep?.[repId]
        const repInvoices = repData?.invoices || []
        const payoutStructure = repData?.payoutStructure || 'two_payment'
        const isSinglePay = payoutStructure === 'single_payment'
        const weekStart = new Date(weekStartStr)
        weekStart.setHours(0,0,0,0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6)
        weekEnd.setHours(23,59,59,999)

        const upfrontEvents: any[] = []
        const finalEvents: any[] = []
        const pendingEvents: any[] = []

        repInvoices.forEach((inv: any) => {
          if (inv.issueDate) {
            const idate = new Date(inv.issueDate)
            if (idate >= weekStart && idate <= weekEnd) {
              upfrontEvents.push({ name: inv.name || inv.accountName, invoiceNumber: inv.invoiceNumber, amount: inv.commission?.upfront || 0 })
              // If this week's invoice is still unpaid, the 2nd half is pending
              if (!inv.isPaid && (inv.commission?.future || 0) > 0) {
                pendingEvents.push({ name: inv.name || inv.accountName, invoiceNumber: inv.invoiceNumber, amount: inv.commission?.future || 0 })
              }
            }
          }
          if (inv.isPaid && inv.paymentDate && inv.commission?.final !== 0) {
            const pdate = new Date(inv.paymentDate)
            if (pdate >= weekStart && pdate <= weekEnd) {
              finalEvents.push({ name: inv.name || inv.accountName, invoiceNumber: inv.invoiceNumber, amount: inv.commission?.final || 0 })
            }
          }
        })

        const totalCommission = [...upfrontEvents, ...finalEvents].reduce((sum, ev) => sum + ev.amount, 0)
        const weekPendingTotal = pendingEvents.reduce((sum, ev) => sum + ev.amount, 0)

        // Sales created this week (for single-pay reps: unpaid invoices they wrote)
        const salesCreatedThisWeek: any[] = []
        let salesCreatedTotal = 0
        // All-time pending commissions (all unpaid invoices)
        const allPendingCommissions: any[] = []
        let allPendingTotal = 0

        repInvoices.forEach((inv: any) => {
          // Single-pay: show all invoices CREATED this week as "sales created"
          if (isSinglePay && inv.issueDate) {
            const idate = new Date(inv.issueDate)
            if (idate >= weekStart && idate <= weekEnd && !inv.isPaid) {
              const potentialComm = inv.commission?.future || inv.commission?.total || (inv.profit * 0.5) || 0
              salesCreatedThisWeek.push({
                name: inv.name || inv.accountName,
                invoiceNumber: inv.invoiceNumber,
                amount: inv.amount || 0,
                profit: inv.profit || 0,
                potentialCommission: potentialComm,
              })
              salesCreatedTotal += potentialComm
            }
          }
          // All unpaid invoices across all time
          if (!inv.isPaid) {
            const futureComm = inv.commission?.future || inv.commission?.total || (inv.profit * 0.5) || 0
            if (futureComm > 0) {
              allPendingCommissions.push({
                name: inv.name || inv.accountName,
                invoiceNumber: inv.invoiceNumber,
                amount: inv.amount || 0,
                potentialCommission: futureComm,
                issueDate: inv.issueDate,
              })
              allPendingTotal += futureComm
            }
          }
        })

        // Find active advances and calculate deductions
        const advances = []
        let totalDeductions = 0
        if (advData.success) {
          for (const a of advData.data) {
             if (a.isFullyPaid) continue
             const deduction = a.agreedPayback || a.deductionRate || (a.splitOverWeeks ? a.amount / a.splitOverWeeks : 0)
             if (deduction > 0) {
               const remaining = a.amount - a.amountPaidBack
               advances.push({ 
                 reason: a.reason || "Company Advance", 
                 deduction, 
                 remaining,
                 termWeeks: a.termWeeks || a.splitOverWeeks,
                 weeksLeft: a.termWeeks ? Math.ceil(remaining / deduction) : null,
               })
               totalDeductions += deduction
             }
          }
        }

        // Find approved reimbursements for this week
        const reimbursements = []
        let totalReimbursements = 0
        if (reimData.success) {
           for (const r of reimData.data) {
              if (r.status === 'APPROVED') {
                const rdate = new Date(r.dateProcessed || r.dateSubmitted)
                if (rdate >= weekStart && rdate <= weekEnd) {
                   reimbursements.push({ description: r.description, amount: r.amount })
                   totalReimbursements += r.amount
                }
              }
           }
        }

        // Base pay earnings for this week
        let basePay = null
        let drawRecovery = 0
        if (basePayData.success && basePayData.data?.length > 0) {
          const weekEarning = basePayData.data.find((e: any) => {
            const ps = new Date(e.periodStart)
            return ps >= weekStart && ps <= weekEnd
          })
          if (weekEarning) {
            basePay = {
              type: weekEarning.type,
              amount: weekEarning.amount,
              description: weekEarning.description,
              hoursWorked: weekEarning.hoursWorked,
              hourlyRate: weekEarning.hourlyRate,
              status: weekEarning.status,
            }
            // Draw recovery: if draw is recoverable, offset against commission
            if (weekEarning.type === "DRAW" && activePlan?.drawRecoverable && totalCommission > 0) {
              drawRecovery = Math.min(weekEarning.amount, totalCommission)
            }
          }
        }

        // Performance commitment from plan
        let commitment = null
        if (activePlan?.commitmentEnabled) {
          // Get MTD stats from commission data
          const now = new Date()
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
          let mtdActual = 0
          repInvoices.forEach((inv: any) => {
            const idate = new Date(inv.issueDate)
            if (idate >= monthStart && idate <= now) {
              switch (activePlan.commitmentMetric) {
                case "SUBTOTAL": mtdActual += inv.amount || 0; break
                case "DEAD_PROFIT": mtdActual += inv.deadProfit || 0; break
                case "NET_PROFIT": mtdActual += inv.profit || 0; break
                case "INVOICES_COUNT": mtdActual += 1; break
              }
            }
          })
          commitment = {
            metric: activePlan.commitmentMetric,
            target: activePlan.commitmentTarget,
            actual: mtdActual,
            met: mtdActual >= (activePlan.commitmentTarget || 0),
            vigRate: activePlan.commitmentVigRate,
          }
        }

        // Plan summary for header
        const planSummary = activePlan ? {
          payType: activePlan.payType,
          baseAmount: activePlan.baseAmount,
          baseInterval: activePlan.baseInterval,
          commissionEnabled: activePlan.commissionEnabled,
          commissionRate: activePlan.commissionRate,
          drawRecoverable: activePlan.drawRecoverable,
        } : null

        // YTD Stats
        let ytdSales = 0
        let ytdDeadProfit = 0
        let ytdCommEarned = 0
        let ytdPending = 0
        const ytdDeals = repInvoices.length

        repInvoices.forEach((inv: any) => {
          ytdSales += inv.amount || 0
          ytdDeadProfit += inv.deadProfit || 0
          ytdCommEarned += inv.commission?.total || 0
          if (!inv.isPaid && inv.commission?.future) {
            ytdPending += inv.commission.future
          }
        })

        setData({
          repName,
          planSummary,
          basePay,
          drawRecovery,
          totalCommission,
          upfrontEvents,
          finalEvents,
          pendingEvents,
          weekPendingTotal,
          advances,
          reimbursements,
          totalReimbursements,
          totalDeductions,
          commitment,
          ytdSales,
          ytdDeadProfit,
          ytdCommEarned,
          ytdPending,
          ytdDeals,
          payoutStructure,
          isSinglePay,
          salesCreatedThisWeek,
          salesCreatedTotal,
          allPendingCommissions,
          allPendingTotal,
        })

      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [repId, weekStartStr])

  useEffect(() => {
    if (!loading && data) {
      setTimeout(() => window.print(), 500)
    }
  }, [loading, data])

  if (loading) return <div className="p-8 text-black bg-white min-h-screen">Loading Pay Voucher...</div>
  if (!data) return <div className="p-8 text-black bg-white min-h-screen">Error loading data.</div>

  const basePayAmount = data.basePay?.amount || 0
  const finalPay = basePayAmount + data.totalCommission + data.totalReimbursements - data.totalDeductions - data.drawRecovery

  const payTypeLabel: Record<string, string> = {
    SALARY: "Salary",
    DRAW: "Draw",
    HOURLY: "Hourly",
    COMMISSION_ONLY: "Commission Only",
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: letter portrait;
            margin: 0.75in 0.6in;
            @bottom-center { content: 'Page ' counter(page) ' of ' counter(pages); }
          }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          tr, section { page-break-inside: avoid; }
          .print-hidden { display: none !important; }
        }
      `}} />
      <div className="bg-gray-100 min-h-screen p-4 print:p-0 print:bg-white text-black font-sans">
        <div className="max-w-4xl mx-auto print:max-w-none print:mx-0">
          
          <div className="mb-4 print-hidden flex justify-end">
            <button onClick={() => window.print()} className="bg-black text-white px-6 py-2 font-bold rounded shadow hover:bg-gray-800 transition-colors">
              Print
            </button>
          </div>

          <table className="w-full bg-white print:bg-transparent border-collapse">
            <thead>
              <tr>
                <td>
                  {/* ── HEADER ── */}
                  <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-6 pt-4 px-8 print:px-0 print:pt-0">
                    <div className="flex items-center gap-4">
                      <img src="/images/logo_light.png" alt="Titan Diamond LLC" className="h-12 w-auto object-contain" />
                      <div>
                        <h1 className="text-2xl font-black uppercase tracking-widest text-black">Titan Diamond LLC</h1>
                        <p className="text-xs font-bold text-gray-800 uppercase tracking-wider mt-0.5">Weekly Pay Voucher</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <h2 className="text-xl font-bold text-black">{data.repName}</h2>
                      <p className="text-xs font-semibold text-gray-800">Week of: {fmtDate(weekStartStr)}</p>
                      <p className="text-xs font-semibold text-gray-500">Generated: {fmtDate(new Date().toISOString())}</p>
                    </div>
                  </div>
                </td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-8 pb-8 print:px-0 print:pb-0">
                  
                  {/* ── PLAN SUMMARY BAR ── */}
                  {data.planSummary && (
                    <div className="border border-black rounded px-4 py-2 mb-6 flex items-center justify-between text-sm font-semibold">
                      <span>Compensation Plan:</span>
                      <span>{payTypeLabel[data.planSummary.payType] || data.planSummary.payType}
                        {data.planSummary.commissionEnabled && ` + Commission (${((data.planSummary.commissionRate || 0.5) * 100).toFixed(0)}%)`}
                      </span>
                      {data.planSummary.baseAmount && (
                        <span className="text-black">
                          Base: {fmt(data.planSummary.baseAmount)}/{(data.planSummary.baseInterval || "WEEKLY").toLowerCase()}
                          {data.planSummary.drawRecoverable && data.planSummary.payType === "DRAW" && " (recoverable)"}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="space-y-6">
                    {/* ── BASE PAY ── */}
                    {data.basePay && data.basePay.amount > 0 && (
                      <section className="border border-gray-300 rounded overflow-hidden">
                        <h3 className="text-sm font-bold bg-gray-100 border-b border-gray-300 px-3 py-2 uppercase tracking-wide">Base Pay</h3>
                        <table className="w-full text-sm">
                          <tbody>
                            <tr className="border-b border-gray-100 last:border-0">
                              <td className="py-2 px-3">{data.basePay.description}</td>
                              {data.basePay.hoursWorked && (
                                <td className="py-2 px-3 text-gray-600">{data.basePay.hoursWorked} hrs</td>
                              )}
                              <td className="py-2 px-3 text-right font-bold text-black">+{fmt(data.basePay.amount)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </section>
                    )}

                    {/* ── COMMISSIONS ── */}
                    <section className="border border-gray-300 rounded overflow-hidden">
                      <h3 className="text-sm font-bold bg-gray-100 border-b border-gray-300 px-3 py-2 uppercase tracking-wide">Commissions</h3>
                      
                      {data.upfrontEvents.length > 0 && (
                        <div className="p-3 border-b border-gray-200 last:border-0">
                          <h4 className="font-semibold text-xs uppercase tracking-wider mb-2 text-gray-600">Upfront Commissions (New Deals)</h4>
                          <table className="w-full text-sm">
                            <tbody>
                              {data.upfrontEvents.map((ev: any, i: number) => (
                                <tr key={i} className="border-b border-gray-100 last:border-0">
                                  <td className="py-1">{ev.name}</td>
                                  <td className="py-1 text-right">{fmt(ev.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {data.finalEvents.length > 0 && (
                        <div className="p-3 border-b border-gray-200 last:border-0">
                          <h4 className="font-semibold text-xs uppercase tracking-wider mb-2 text-gray-600">Final Commissions (Paid Deals)</h4>
                          <table className="w-full text-sm">
                            <tbody>
                              {data.finalEvents.map((ev: any, i: number) => (
                                <tr key={i} className="border-b border-gray-100 last:border-0">
                                  <td className="py-1">{ev.name}</td>
                                  <td className="py-1 text-right">{fmt(ev.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {data.upfrontEvents.length === 0 && data.finalEvents.length === 0 && (
                        <div className="p-3">
                          <p className="text-sm text-gray-500 py-1">No commission events this week.</p>
                        </div>
                      )}
                      
                      <div className="bg-gray-50 px-3 py-2 flex justify-between font-bold text-sm border-t border-gray-300">
                        <span>Commission Subtotal</span>
                        <span>{fmt(data.totalCommission)}</span>
                      </div>
                    </section>

                    {/* ── SALES CREATED THIS WEEK (Single-Pay Reps) ── */}
                    {data.isSinglePay && data.salesCreatedThisWeek.length > 0 && (
                      <section className="border border-gray-300 rounded overflow-hidden">
                        <h3 className="text-sm font-bold bg-gray-100 border-b border-gray-300 px-3 py-2 uppercase tracking-wide">Sales Created This Week — Pending Payment</h3>
                        <div className="p-3">
                          <p className="text-xs text-gray-500 mb-2">These invoices were created this week. Commission will be earned when the customer pays.</p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-600 border-b border-gray-200 text-xs uppercase tracking-wider">
                                <th className="py-1 px-1 font-semibold">Invoice</th>
                                <th className="py-1 px-1 font-semibold">Account</th>
                                <th className="py-1 px-1 font-semibold text-right">Sale Amount</th>
                                <th className="py-1 px-1 font-semibold text-right">Profit</th>
                                <th className="py-1 px-1 font-semibold text-right">Potential Comm.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.salesCreatedThisWeek.map((ev: any, i: number) => (
                                <tr key={i} className="border-b border-gray-100 last:border-0">
                                  <td className="py-1 px-1 font-mono text-xs">#{ev.invoiceNumber || '--'}</td>
                                  <td className="py-1 px-1">{ev.name}</td>
                                  <td className="py-1 px-1 text-right">{fmt(ev.amount)}</td>
                                  <td className="py-1 px-1 text-right">{fmt(ev.profit)}</td>
                                  <td className="py-1 px-1 text-right font-bold">{fmt(ev.potentialCommission)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="bg-gray-50 px-3 py-2 flex justify-between font-bold text-sm border-t border-gray-300">
                          <span>Pending Pay Created This Week</span>
                          <span>{fmt(data.salesCreatedTotal)}</span>
                        </div>
                      </section>
                    )}

                    {/* ── TOTAL PENDING COMMISSIONS (ALL TIME) ── */}
                    {data.allPendingTotal > 0 && (
                      <section className="border border-gray-300 rounded overflow-hidden">
                        <h3 className="text-sm font-bold bg-gray-100 border-b border-gray-300 px-3 py-2 uppercase tracking-wide">Total Pending Commissions — All Unpaid Invoices</h3>
                        <div className="p-3">
                          <p className="text-xs text-gray-500 mb-2">{data.allPendingCommissions.length} unpaid invoice{data.allPendingCommissions.length !== 1 ? 's' : ''} awaiting customer payment.</p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-600 border-b border-gray-200 text-xs uppercase tracking-wider">
                                <th className="py-1 px-1 font-semibold">Invoice</th>
                                <th className="py-1 px-1 font-semibold">Account</th>
                                <th className="py-1 px-1 font-semibold text-right">Sale Amount</th>
                                <th className="py-1 px-1 font-semibold text-right">Pending Comm.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.allPendingCommissions.slice(0, 25).map((ev: any, i: number) => (
                                <tr key={i} className="border-b border-gray-100 last:border-0">
                                  <td className="py-1 px-1 font-mono text-xs">#{ev.invoiceNumber || '--'}</td>
                                  <td className="py-1 px-1">{ev.name}</td>
                                  <td className="py-1 px-1 text-right">{fmt(ev.amount)}</td>
                                  <td className="py-1 px-1 text-right font-bold">{fmt(ev.potentialCommission)}</td>
                                </tr>
                              ))}
                              {data.allPendingCommissions.length > 25 && (
                                <tr>
                                  <td colSpan={4} className="py-1 px-1 text-center text-xs text-gray-400 italic">
                                    + {data.allPendingCommissions.length - 25} more invoices
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div className="bg-gray-50 px-3 py-2 flex justify-between font-bold text-sm border-t border-gray-300">
                          <span>Total Pending Commissions</span>
                          <span>{fmt(data.allPendingTotal)}</span>
                        </div>
                      </section>
                    )}

                    {/* ── PENDING COMMISSIONS (FUTURE 2ND PAYMENTS) ── */}
                    {!data.isSinglePay && data.pendingEvents.length > 0 && (
                      <section className="border border-gray-300 rounded overflow-hidden">
                        <h3 className="text-sm font-bold bg-gray-100 border-b border-gray-300 px-3 py-2 uppercase tracking-wide">Pending Commissions — 2nd Payment Due on Collection</h3>
                        <div className="p-3">
                          <p className="text-xs text-gray-500 mb-2">These commissions will be released when the customer pays the invoice.</p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-600 border-b border-gray-200 text-xs uppercase tracking-wider">
                                <th className="py-1 px-1 font-semibold">Invoice</th>
                                <th className="py-1 px-1 font-semibold">Account</th>
                                <th className="py-1 px-1 font-semibold text-right">2nd Half Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.pendingEvents.map((ev: any, i: number) => (
                                <tr key={i} className="border-b border-gray-100 last:border-0">
                                  <td className="py-1 px-1 font-mono text-xs">#{ev.invoiceNumber || '--'}</td>
                                  <td className="py-1 px-1">{ev.name}</td>
                                  <td className="py-1 px-1 text-right">{fmt(ev.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="bg-gray-50 px-3 py-2 flex justify-between font-bold text-sm border-t border-gray-300">
                          <span>Total Pending (awaiting payment)</span>
                          <span>{fmt(data.weekPendingTotal)}</span>
                        </div>
                      </section>
                    )}

                    {/* ── DRAW RECOVERY ── */}
                    {data.drawRecovery > 0 && (
                      <section className="border border-gray-300 rounded overflow-hidden">
                        <h3 className="text-sm font-bold bg-gray-100 border-b border-gray-300 px-3 py-2 uppercase tracking-wide">Draw Recovery</h3>
                        <table className="w-full text-sm">
                          <tbody>
                            <tr className="border-b border-gray-100 last:border-0">
                              <td className="py-2 px-3">Draw offset against commissions</td>
                              <td className="py-2 px-3 text-right text-black font-bold">-{fmt(data.drawRecovery)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </section>
                    )}

                    {/* ── REIMBURSEMENTS ── */}
                    {data.reimbursements.length > 0 && (
                      <section className="border border-gray-300 rounded overflow-hidden">
                        <h3 className="text-sm font-bold bg-gray-100 border-b border-gray-300 px-3 py-2 uppercase tracking-wide">Reimbursements</h3>
                        <table className="w-full text-sm">
                          <tbody>
                            {data.reimbursements.map((r: any, i: number) => (
                              <tr key={i} className="border-b border-gray-100 last:border-0">
                                <td className="py-2 px-3">{r.description}</td>
                                <td className="py-2 px-3 text-right text-black font-bold">+{fmt(r.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </section>
                    )}

                    {/* ── ADVANCE DEDUCTIONS ── */}
                    {data.advances.length > 0 && (
                      <section className="border border-gray-300 rounded overflow-hidden">
                        <h3 className="text-sm font-bold bg-gray-100 border-b border-gray-300 px-3 py-2 uppercase tracking-wide">Advance Deductions</h3>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-600 border-b border-gray-200 text-xs uppercase tracking-wider">
                              <th className="py-2 px-3 font-semibold">Advance</th>
                              <th className="py-2 px-3 font-semibold text-right">Remaining</th>
                              {data.advances.some((a: any) => a.weeksLeft) && (
                                <th className="py-2 px-3 font-semibold text-right">Weeks Left</th>
                              )}
                              <th className="py-2 px-3 font-semibold text-right">Deduction</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.advances.map((a: any, i: number) => (
                              <tr key={i} className="border-b border-gray-100 last:border-0">
                                <td className="py-2 px-3">{a.reason}</td>
                                <td className="py-2 px-3 text-right">{fmt(a.remaining)}</td>
                                {data.advances.some((a: any) => a.weeksLeft) && (
                                  <td className="py-2 px-3 text-right">{a.weeksLeft || "—"}</td>
                                )}
                                <td className="py-2 px-3 text-right text-black font-bold">-{fmt(a.deduction)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </section>
                    )}

                    {/* ── PERFORMANCE COMMITMENT ── */}
                    {data.commitment && (
                      <section className="border border-gray-300 rounded overflow-hidden">
                        <h3 className="text-sm font-bold bg-gray-100 border-b border-gray-300 px-3 py-2 uppercase tracking-wide">Performance Commitment</h3>
                        <div className="p-3">
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500 block text-xs uppercase tracking-wider">Metric</span>
                              <span className="font-bold">{data.commitment.metric?.replace(/_/g, " ")}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 block text-xs uppercase tracking-wider">Monthly Target</span>
                              <span className="font-bold">{data.commitment.metric === "INVOICES_COUNT" ? data.commitment.target : fmt(data.commitment.target)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 block text-xs uppercase tracking-wider">MTD Actual</span>
                              <span className={`font-bold ${data.commitment.met ? "text-black" : "text-black"}`}>
                                {data.commitment.metric === "INVOICES_COUNT" ? data.commitment.actual : fmt(data.commitment.actual)}
                                {data.commitment.met ? " ✓ ON TRACK" : " ✗ BEHIND"}
                              </span>
                            </div>
                          </div>
                          {data.commitment.vigRate && (
                            <div className="mt-3 pt-3 border-t border-gray-200 text-sm">
                              <span className="text-gray-500 text-xs uppercase tracking-wider">VIG Rate: </span>
                              <span className="font-bold">{data.commitment.vigRate}x {data.commitment.met ? "(maintained)" : "(at risk)"}</span>
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    {/* ── YTD SUMMARY ── */}
                    <section className="border border-black rounded overflow-hidden">
                      <h3 className="text-sm font-bold bg-gray-200 border-b border-black px-3 py-2 uppercase tracking-wide text-center">Year-To-Date Earnings Summary</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-gray-300 text-sm">
                        <div className="p-3 text-center">
                          <div className="text-xs text-gray-600 uppercase tracking-wider mb-1">YTD Deals</div>
                          <div className="font-bold">{data.ytdDeals}</div>
                        </div>
                        <div className="p-3 text-center">
                          <div className="text-xs text-gray-600 uppercase tracking-wider mb-1">YTD Sales Revenue</div>
                          <div className="font-bold">{fmt(data.ytdSales)}</div>
                        </div>
                        <div className="p-3 text-center">
                          <div className="text-xs text-gray-600 uppercase tracking-wider mb-1">YTD Dead Profit</div>
                          <div className="font-bold">{fmt(data.ytdDeadProfit)}</div>
                        </div>
                        <div className="p-3 text-center">
                          <div className="text-xs text-gray-600 uppercase tracking-wider mb-1">YTD Comm Earned</div>
                          <div className="font-bold">{fmt(data.ytdCommEarned)}</div>
                        </div>
                        <div className="p-3 text-center col-span-2 sm:col-span-2 border-t border-gray-300">
                          <div className="text-xs text-gray-600 uppercase tracking-wider mb-1">YTD Comm Pending (Future Payments)</div>
                          <div className="font-bold">{fmt(data.ytdPending)}</div>
                        </div>
                        <div className="p-3 text-center col-span-2 sm:col-span-2 border-t border-gray-300">
                          <div className="text-xs text-gray-600 uppercase tracking-wider mb-1">YTD Total (Earned + Pending)</div>
                          <div className="font-bold text-lg">{fmt(data.ytdCommEarned + data.ytdPending)}</div>
                        </div>
                      </div>
                    </section>

                  </div>

                  {/* ── TOTAL NET PAYOUT ── */}
                  <div className="mt-8 border-t-2 border-black pt-4">
                    <div className="flex flex-col items-end">
                      <table className="text-sm text-gray-700 w-72 mb-4">
                        <tbody>
                          {basePayAmount > 0 && (
                            <tr>
                              <td className="py-1">Base Pay</td>
                              <td className="py-1 text-right font-semibold">+{fmt(basePayAmount)}</td>
                            </tr>
                          )}
                          <tr>
                            <td className="py-1">Commissions Earned</td>
                            <td className="py-1 text-right font-semibold">+{fmt(data.totalCommission)}</td>
                          </tr>
                          {data.drawRecovery > 0 && (
                            <tr>
                              <td className="py-1">Draw Recovery</td>
                              <td className="py-1 text-right font-semibold text-black">-{fmt(data.drawRecovery)}</td>
                            </tr>
                          )}
                          {data.totalReimbursements > 0 && (
                            <tr>
                              <td className="py-1">Reimbursements</td>
                              <td className="py-1 text-right font-semibold">+{fmt(data.totalReimbursements)}</td>
                            </tr>
                          )}
                          {data.totalDeductions > 0 && (
                            <tr>
                              <td className="py-1">Advance Deductions</td>
                              <td className="py-1 text-right font-semibold text-black">-{fmt(data.totalDeductions)}</td>
                            </tr>
                          )}
                          {data.weekPendingTotal > 0 && (
                            <tr className="border-t border-gray-200">
                              <td className="py-1 text-gray-500 italic">Pending 2nd Payments</td>
                              <td className="py-1 text-right font-semibold text-gray-500 italic">{fmt(data.weekPendingTotal)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                      <div className="border-t-4 border-black pt-2 w-full flex justify-between items-end">
                        <div className="text-xs text-gray-600">
                          <p>Please review your weekly earnings statement.</p>
                          <p>Report any discrepancies immediately.</p>
                        </div>
                        <div className="text-right">
                          <h2 className="text-xs font-bold uppercase tracking-widest text-black mb-1">Total Weekly Earnings</h2>
                          <div className="text-3xl font-black text-black">{fmt(finalPay)}</div>
                          {data.weekPendingTotal > 0 && (
                            <div className="text-xs text-gray-500 mt-1">+ {fmt(data.weekPendingTotal)} pending on collection</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
