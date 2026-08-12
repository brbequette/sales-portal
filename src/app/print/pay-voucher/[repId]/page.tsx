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
        const repInvoices = commData.byRep?.[repId]?.invoices || []
        const weekStart = new Date(weekStartStr)
        weekStart.setHours(0,0,0,0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6)
        weekEnd.setHours(23,59,59,999)

        const upfrontEvents: any[] = []
        const finalEvents: any[] = []

        repInvoices.forEach((inv: any) => {
          if (inv.issueDate) {
            const idate = new Date(inv.issueDate)
            if (idate >= weekStart && idate <= weekEnd) {
              upfrontEvents.push({ name: inv.name || inv.accountName, amount: inv.commission?.upfront || 0 })
            }
          }
          if (inv.isPaid && inv.paymentDate && inv.commission?.final !== 0) {
            const pdate = new Date(inv.paymentDate)
            if (pdate >= weekStart && pdate <= weekEnd) {
              finalEvents.push({ name: inv.name || inv.accountName, amount: inv.commission?.final || 0 })
            }
          }
        })

        const totalCommission = [...upfrontEvents, ...finalEvents].reduce((sum, ev) => sum + ev.amount, 0)

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

        setData({
          repName,
          planSummary,
          basePay,
          drawRecovery,
          totalCommission,
          upfrontEvents,
          finalEvents,
          advances,
          reimbursements,
          totalReimbursements,
          totalDeductions,
          commitment,
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
    <div className="bg-white text-black min-h-screen font-sans p-10 max-w-4xl mx-auto print:p-6 print:m-0">
      {/* ── HEADER ── */}
      <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-widest">Titan Diamond</h1>
          <p className="text-sm font-semibold mt-1">Weekly Pay Voucher</p>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold">{data.repName}</h2>
          <p className="text-sm">Week of: {fmtDate(weekStartStr)}</p>
          <p className="text-sm">Generated: {fmtDate(new Date().toISOString())}</p>
        </div>
      </div>

      {/* ── PLAN SUMMARY BAR ── */}
      {data.planSummary && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 mb-6 flex items-center justify-between text-sm">
          <span className="font-bold">Compensation Plan:</span>
          <span>{payTypeLabel[data.planSummary.payType] || data.planSummary.payType}
            {data.planSummary.commissionEnabled && ` + Commission (${((data.planSummary.commissionRate || 0.5) * 100).toFixed(0)}%)`}
          </span>
          {data.planSummary.baseAmount && (
            <span className="text-gray-600">
              Base: {fmt(data.planSummary.baseAmount)}/{(data.planSummary.baseInterval || "WEEKLY").toLowerCase()}
              {data.planSummary.drawRecoverable && data.planSummary.payType === "DRAW" && " (recoverable)"}
            </span>
          )}
        </div>
      )}

      <div className="space-y-6">
        {/* ── BASE PAY ── */}
        {data.basePay && data.basePay.amount > 0 && (
          <section>
            <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-3">Base Pay</h3>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-2">{data.basePay.description}</td>
                  {data.basePay.hoursWorked && (
                    <td className="py-2 text-gray-500">{data.basePay.hoursWorked} hrs</td>
                  )}
                  <td className="py-2 text-right font-bold text-green-700">+{fmt(data.basePay.amount)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {/* ── COMMISSIONS ── */}
        <section>
          <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-3">Commissions Earned</h3>
          
          {data.upfrontEvents.length > 0 && (
            <div className="mb-4">
              <h4 className="font-semibold text-sm mb-2 text-gray-700">Upfront Commissions (New Deals)</h4>
              <table className="w-full text-sm">
                <tbody>
                  {data.upfrontEvents.map((ev: any, i: number) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2">{ev.name}</td>
                      <td className="py-2 text-right">{fmt(ev.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.finalEvents.length > 0 && (
            <div className="mb-4">
              <h4 className="font-semibold text-sm mb-2 text-gray-700">Final Commissions (Paid Deals)</h4>
              <table className="w-full text-sm">
                <tbody>
                  {data.finalEvents.map((ev: any, i: number) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2">{ev.name}</td>
                      <td className="py-2 text-right">{fmt(ev.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.upfrontEvents.length === 0 && data.finalEvents.length === 0 && (
            <p className="text-sm text-gray-400 py-2">No commission events this week.</p>
          )}
          
          <div className="flex justify-end font-bold text-base mt-2 pt-2 border-t border-gray-300">
            <span>Commission Subtotal: {fmt(data.totalCommission)}</span>
          </div>
        </section>

        {/* ── DRAW RECOVERY ── */}
        {data.drawRecovery > 0 && (
          <section>
            <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-3">Draw Recovery</h3>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-2">Draw offset against commissions</td>
                  <td className="py-2 text-right text-red-700 font-bold">-{fmt(data.drawRecovery)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {/* ── REIMBURSEMENTS ── */}
        {data.reimbursements.length > 0 && (
          <section>
            <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-3">Reimbursements</h3>
            <table className="w-full text-sm">
              <tbody>
                {data.reimbursements.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2">{r.description}</td>
                    <td className="py-2 text-right text-green-700">+{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ── ADVANCE DEDUCTIONS ── */}
        {data.advances.length > 0 && (
          <section>
            <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-3">Advance Deductions</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-1 font-semibold">Advance</th>
                  <th className="py-1 font-semibold text-right">Remaining</th>
                  {data.advances.some((a: any) => a.weeksLeft) && (
                    <th className="py-1 font-semibold text-right">Weeks Left</th>
                  )}
                  <th className="py-1 font-semibold text-right">Deduction</th>
                </tr>
              </thead>
              <tbody>
                {data.advances.map((a: any, i: number) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2">{a.reason}</td>
                    <td className="py-2 text-right text-gray-500">{fmt(a.remaining)}</td>
                    {data.advances.some((a: any) => a.weeksLeft) && (
                      <td className="py-2 text-right text-gray-500">{a.weeksLeft || "—"}</td>
                    )}
                    <td className="py-2 text-right text-red-700 font-bold">-{fmt(a.deduction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ── PERFORMANCE COMMITMENT ── */}
        {data.commitment && (
          <section>
            <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-3">Performance Commitment</h3>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block">Metric</span>
                  <span className="font-bold">{data.commitment.metric?.replace(/_/g, " ")}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Monthly Target</span>
                  <span className="font-bold">{data.commitment.metric === "INVOICES_COUNT" ? data.commitment.target : fmt(data.commitment.target)}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">MTD Actual</span>
                  <span className={`font-bold ${data.commitment.met ? "text-green-700" : "text-red-700"}`}>
                    {data.commitment.metric === "INVOICES_COUNT" ? data.commitment.actual : fmt(data.commitment.actual)}
                    {data.commitment.met ? " ✓ ON TRACK" : " ✗ BEHIND"}
                  </span>
                </div>
              </div>
              {data.commitment.vigRate && (
                <div className="mt-2 pt-2 border-t border-gray-200 text-sm">
                  <span className="text-gray-500">VIG Rate: </span>
                  <span className="font-bold">{data.commitment.vigRate}x {data.commitment.met ? "(maintained)" : "(at risk)"}</span>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* ── TOTAL NET PAYOUT ── */}
      <div className="mt-10 border-t-4 border-black pt-4">
        {/* Breakdown summary */}
        <div className="text-sm text-gray-600 space-y-1 mb-4">
          {basePayAmount > 0 && <div className="flex justify-between"><span>Base Pay</span><span>+{fmt(basePayAmount)}</span></div>}
          <div className="flex justify-between"><span>Commissions</span><span>+{fmt(data.totalCommission)}</span></div>
          {data.drawRecovery > 0 && <div className="flex justify-between text-red-700"><span>Draw Recovery</span><span>-{fmt(data.drawRecovery)}</span></div>}
          {data.totalReimbursements > 0 && <div className="flex justify-between"><span>Reimbursements</span><span>+{fmt(data.totalReimbursements)}</span></div>}
          {data.totalDeductions > 0 && <div className="flex justify-between text-red-700"><span>Advance Deductions</span><span>-{fmt(data.totalDeductions)}</span></div>}
        </div>

        <div className="flex justify-between items-end border-t-2 border-gray-300 pt-4">
          <div className="text-sm text-gray-500">
            <p>Please review your weekly statement.</p>
            <p>Report any discrepancies immediately.</p>
          </div>
          <div className="text-right">
            <h2 className="text-sm font-bold uppercase text-gray-600 mb-1">Total Net Payout</h2>
            <div className="text-4xl font-bold">{fmt(finalPay)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
