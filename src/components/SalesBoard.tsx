"use client"
import React, { useEffect, useState, useMemo } from "react"
import { FiTrendingUp, FiDollarSign, FiTarget, FiActivity, FiAward, FiClock, FiStar } from "react-icons/fi"

const REPS_INIT = [
  { id: "rep_1", name: "Ross Haisler", role: "Enterprise Sales Director", expectedVig: 1.5, gradient: "from-purple-500 to-indigo-500" },
  { id: "rep_2", name: "Richard Griffin", role: "Senior Account Executive", expectedVig: 1.5, gradient: "from-pink-500 to-rose-500" },
  { id: "rep_3", name: "Ben Bequette", role: "Regional Sales Lead", expectedVig: 1.3, gradient: "from-blue-500 to-blue-700" },
  { id: "rep_4", name: "Bobby Salyers", role: "Senior Sales Representative", expectedVig: 1.3, gradient: "from-teal-500 to-emerald-600" },
  { id: "rep_5", name: "Montgomery Morgan", role: "Key Account Manager", expectedVig: 1.3, gradient: "from-amber-500 to-amber-700" }
]

const REP_WEEKLY_TARGETS: Record<string, number> = {
  "rep_1": 20000,
  "rep_2": 10000,
  "rep_3": 10000,
  "rep_4": 4000,
  "rep_5": 20000
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(val)
}

export function SalesBoard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentScreen, setCurrentScreen] = useState<"TEAM" | "REPS" | "DEALS">("TEAM")

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/zoho-invoices")
        const payload = await res.json()
        
        // --- Aggregation Logic Ported from Legacy Dashboard ---
        const today = new Date()
        const day = today.getDay()
        const diffToMonday = today.getDate() - day + (day === 0 ? -6 : 1)
        const monday = new Date(today.getFullYear(), today.getMonth(), diffToMonday)
        
        const weekDays: string[] = []
        for (let i = 0; i < 5; i++) {
          const nextDay = new Date(monday)
          nextDay.setDate(monday.getDate() + i)
          const yyyy = nextDay.getFullYear()
          const mm = String(nextDay.getMonth() + 1).padStart(2, '0')
          const dd = String(nextDay.getDate()).padStart(2, '0')
          weekDays.push(`${yyyy}-${mm}-${dd}`)
        }

        const repsMap: Record<string, any> = {}
        REPS_INIT.forEach(r => {
          repsMap[r.id] = { ...r, metrics: { sales: 0, profit: 0, commission: 0, dealsClosed: 0 } }
        })

        let teamSales = 0
        let teamProfit = 0
        let teamCommission = 0
        let teamTarget = Object.values(REP_WEEKLY_TARGETS).reduce((a, b) => a + b, 0)
        
        const recentDeals: any[] = []

        const invoices = payload.invoices || []
        invoices.forEach((inv: any) => {
          const spName = (inv.salesorder_salesperson_name || inv.salesperson_name || "").toUpperCase()
          if (spName.includes("PAUL") && (spName.includes("GENCUSKI") || spName.includes("GENKUSKI"))) return

          const saleDate = inv.salesorder_date || inv.date
          const inCurrentWeek = weekDays.includes(saleDate)

          if (inCurrentWeek) {
            const amount = Number(inv.sub_total !== undefined ? inv.sub_total : (inv.total || 0))
            const profit = Number(inv.cf_profit_unformatted || inv.custom_field_hash?.cf_profit_unformatted || 0)
            const commission = Number(inv.cf_commision_amount_unformatted || inv.custom_field_hash?.cf_commision_amount_unformatted || 0)

            teamSales += amount
            teamProfit += profit
            teamCommission += commission

            recentDeals.push({
              id: inv.invoice_id,
              customer: inv.customer_name,
              amount,
              profit,
              repName: spName,
              date: saleDate
            })

            const matchedRep = Object.values(repsMap).find(r => r.name.toUpperCase().includes(spName) || spName.includes(r.name.toUpperCase()))
            if (matchedRep) {
              matchedRep.metrics.sales += amount
              matchedRep.metrics.profit += profit
              matchedRep.metrics.commission += commission
              matchedRep.metrics.dealsClosed += 1
            }
          }
        })

        setData({
          team: { sales: teamSales, profit: teamProfit, commission: teamCommission, target: teamTarget },
          reps: Object.values(repsMap).sort((a, b) => b.metrics.sales - a.metrics.sales),
          deals: recentDeals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20)
        })

      } catch (err) {
        console.error("Sales Board Error:", err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

  // Auto-rotate screens
  useEffect(() => {
    const screens: ("TEAM" | "REPS" | "DEALS")[] = ["TEAM", "REPS", "DEALS"]
    const interval = setInterval(() => {
      setCurrentScreen(prev => {
        const idx = screens.indexOf(prev)
        return screens[(idx + 1) % screens.length]
      })
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  if (loading || !data) {
    return (
      <div className="w-full h-full min-h-[600px] flex flex-col items-center justify-center bg-[#0d0e12] rounded-2xl border border-white/10 text-white shadow-2xl relative overflow-hidden">
        <div className="w-16 h-16 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-neutral-400 font-medium tracking-widest uppercase text-sm animate-pulse">Loading Live Metrics</p>
      </div>
    )
  }

  const teamQuotaPct = Math.min(100, Math.round((data.team.sales / data.team.target) * 100))

  return (
    <div className="w-full h-full min-h-[700px] bg-[#0d0e12] rounded-2xl border border-white/5 text-white shadow-2xl relative overflow-hidden flex flex-col font-sans">
      
      {/* Top Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <FiActivity size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">TITAN LIVE BOARD</h2>
            <p className="text-xs text-emerald-400 font-bold tracking-widest uppercase mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Sync Active
            </p>
          </div>
        </div>
        
        {/* Screen Indicators */}
        <div className="flex items-center gap-3">
          {(["TEAM", "REPS", "DEALS"] as const).map(screen => (
            <button 
              key={screen} 
              onClick={() => setCurrentScreen(screen)}
              className={`w-3 h-3 rounded-full transition-all duration-500 ${currentScreen === screen ? "bg-[var(--primary)] w-8 shadow-[0_0_10px_var(--primary)]" : "bg-white/20 hover:bg-white/40"}`}
            />
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative p-8 overflow-hidden">
        
        {/* TEAM SCREEN */}
        <div className={`absolute inset-0 p-8 flex flex-col justify-center transition-all duration-700 transform ${currentScreen === "TEAM" ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0 pointer-events-none"}`}>
          <div className="text-center mb-12">
            <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase mb-4">Current Week Subtotal</h3>
            <div className="text-8xl font-black tracking-tighter bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent drop-shadow-2xl">
              {formatCurrency(data.team.sales)}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
            <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-8 flex flex-col items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <FiTrendingUp size={32} className="text-emerald-400 mb-4" />
              <div className="text-4xl font-black">{formatCurrency(data.team.profit)}</div>
              <div className="text-neutral-400 text-xs font-bold tracking-widest uppercase mt-2">Team Profit</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-8 flex flex-col items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <FiDollarSign size={32} className="text-purple-400 mb-4" />
              <div className="text-4xl font-black">{formatCurrency(data.team.commission)}</div>
              <div className="text-neutral-400 text-xs font-bold tracking-widest uppercase mt-2">Commission Pool</div>
            </div>
          </div>

          <div className="max-w-4xl mx-auto w-full mt-12">
            <div className="flex justify-between text-sm font-bold mb-3">
              <span className="text-neutral-400 uppercase tracking-wider">Weekly Quota</span>
              <span className="text-[var(--primary)]">{teamQuotaPct}% Attained</span>
            </div>
            <div className="w-full h-4 bg-white/5 rounded-full overflow-hidden border border-white/10">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-[var(--primary)] transition-all duration-1000 ease-out relative"
                style={{ width: `${teamQuotaPct}%` }}
              >
                <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]"></div>
              </div>
            </div>
          </div>
        </div>

        {/* REPS SCREEN */}
        <div className={`absolute inset-0 p-8 transition-all duration-700 transform ${currentScreen === "REPS" ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
          <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase mb-8 flex items-center gap-3">
            <FiStar className="text-amber-400" /> Top Performers This Week
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.reps.map((rep: any, idx: number) => {
              const quota = Math.min(100, Math.round((rep.metrics.sales / (REP_WEEKLY_TARGETS[rep.id] || 10000)) * 100))
              return (
                <div key={rep.id} className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 relative overflow-hidden group hover:border-white/20 transition-all">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${rep.gradient} flex items-center justify-center text-white font-black text-xl shadow-lg`}>
                        {rep.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-lg">{rep.name}</h4>
                        <p className="text-xs text-neutral-500 uppercase tracking-wider">{rep.role}</p>
                      </div>
                    </div>
                    {idx === 0 && <FiAward size={28} className="text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" />}
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="text-3xl font-black tracking-tight">{formatCurrency(rep.metrics.sales)}</div>
                      <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mt-1">Subtotal</div>
                    </div>
                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                      <div className={`h-full bg-gradient-to-r ${rep.gradient} transition-all duration-1000`} style={{ width: `${quota}%` }}></div>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-neutral-400">
                      <span>{rep.metrics.dealsClosed} Deals</span>
                      <span>{formatCurrency(rep.metrics.commission)} Comm</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* DEALS SCREEN */}
        <div className={`absolute inset-0 p-8 transition-all duration-700 transform ${currentScreen === "DEALS" ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
          <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase mb-8 flex items-center gap-3">
            <FiTarget className="text-sky-400" /> Recent Live Deals
          </h3>
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden h-full max-h-[500px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/[0.02] border-b border-white/10">
                  <th className="px-6 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest">Customer</th>
                  <th className="px-6 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest">Rep</th>
                  <th className="px-6 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest text-right">Amount</th>
                  <th className="px-6 py-4 text-xs font-bold text-neutral-400 uppercase tracking-widest text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.deals.map((deal: any, idx: number) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{deal.customer}</td>
                    <td className="px-6 py-4 text-neutral-300">
                      <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-bold uppercase">
                        {deal.repName}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-black text-emerald-400">{formatCurrency(deal.amount)}</td>
                    <td className="px-6 py-4 text-right font-bold text-neutral-400">{formatCurrency(deal.profit)}</td>
                  </tr>
                ))}
                {data.deals.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-neutral-500 font-medium">No deals found for the current week.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Progress Bar Timer */}
      <div className="h-1 bg-white/5 w-full">
        <div className="h-full bg-[var(--primary)] animate-[progress_15s_linear_infinite]" style={{ width: '100%' }}></div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}} />
    </div>
  )
}
