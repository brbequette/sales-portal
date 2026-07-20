"use client"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0)
}

function fmtDate(s: string | null) {
  if (!s) return "—"
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
        const [usersRes, commRes, advRes, reimRes] = await Promise.all([
          fetch("/api/admin/users"),
          fetch(`/api/get-commissions?year=${year}`),
          fetch(`/api/manage-advances?userId=${repId}`),
          fetch(`/api/manage-reimbursements?userId=${repId}`)
        ])
        
        const users = await usersRes.json()
        const commData = await commRes.json()
        const advData = await advRes.json()
        const reimData = await reimRes.json()

        const repName = users.users?.find((u: any) => u.id === repId)?.name || "Unknown Rep"
        
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
             const deduction = a.deductionRate || (a.splitOverWeeks ? a.amount / a.splitOverWeeks : 0)
             if (deduction > 0) {
               advances.push({ reason: a.reason, deduction, remaining: a.amount - deduction })
               totalDeductions += deduction
             }
          }
        }

        // Find approved reimbursements
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

        setData({
          repName,
          totalCommission,
          upfrontEvents,
          finalEvents,
          advances,
          reimbursements,
          totalReimbursements,
          totalDeductions
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

  const finalPay = data.totalCommission + data.totalReimbursements - data.totalDeductions

  return (
    <div className="bg-white text-black min-h-screen font-sans p-10 max-w-4xl mx-auto print:p-0 print:m-0">
      <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-8">
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

      <div className="space-y-8">
        {/* COMMISSIONS */}
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
          
          <div className="flex justify-end font-bold text-lg mt-2 pt-2 border-t border-gray-300">
            <span>Total Commission: {fmt(data.totalCommission)}</span>
          </div>
        </section>

        {/* REIMBURSEMENTS */}
        {data.reimbursements.length > 0 && (
          <section>
            <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-3">Reimbursements (Added)</h3>
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

        {/* ADVANCES */}
        {data.advances.length > 0 && (
          <section>
            <h3 className="text-lg font-bold border-b border-gray-300 pb-2 mb-3">Advance Deductions</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-1 font-semibold">Advance Reason</th>
                  <th className="py-1 font-semibold text-right">Remaining Bal.</th>
                  <th className="py-1 font-semibold text-right">Deduction</th>
                </tr>
              </thead>
              <tbody>
                {data.advances.map((a: any, i: number) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2">{a.reason}</td>
                    <td className="py-2 text-right text-gray-500">{fmt(a.remaining)}</td>
                    <td className="py-2 text-right text-red-700">-{fmt(a.deduction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      <div className="mt-12 border-t-4 border-black pt-4 flex justify-between items-end">
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
  )
}
