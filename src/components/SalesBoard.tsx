"use client"
import React, { useEffect, useState, useMemo, useRef } from "react"
import { FiTrendingUp, FiDollarSign, FiTarget, FiActivity, FiAward, FiClock, FiStar, FiMaximize, FiMinimize, FiPlay, FiPause, FiChevronLeft, FiChevronRight, FiAlertCircle } from "react-icons/fi"

const REP_GRADIENTS = [
  "from-purple-500 to-indigo-500",
  "from-pink-500 to-rose-500",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-red-500 to-rose-700",
  "from-fuchsia-500 to-pink-600",
  "from-sky-500 to-blue-700",
  "from-lime-500 to-emerald-700",
  "from-violet-500 to-purple-700",
]

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(val)
}

const formatPercent = (val: number) => {
  return `${val.toFixed(1)}%`
}

const SCREENS = ["WEEKLY_GRID", "REPS_KPI", "MTD_STATS", "YTD_STATS", "OVERDUE_INVOICES"] as const
type ScreenType = typeof SCREENS[number]

export function SalesBoard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentScreen, setCurrentScreen] = useState<ScreenType>("WEEKLY_GRID")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Collapse all rows when screen changes
  useEffect(() => {
    setExpandedRows(new Set())
  }, [currentScreen])

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const boardRef = useRef<HTMLDivElement>(null)
  const ROTATION_TIME = 15000
  const TICK_INTERVAL = 100

  // Fullscreen listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      if (boardRef.current) await boardRef.current.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  }

  // Data fetching and processing
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch users and invoices in parallel
        const [usersRes, res] = await Promise.all([
          fetch("/api/admin/users"),
          fetch("/api/zoho-invoices")
        ])
        const usersPayload = await usersRes.json()
        const payload = await res.json()
        
        // Build reps from users with showOnSalesBoard
        const boardUsers = (usersPayload.users || []).filter((u: any) => u.showOnSalesBoard)
        const today = new Date()
        const currentYear = today.getFullYear()
        const currentMonth = today.getMonth()
        
        const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`

        const dynamicReps = boardUsers.map((u: any, i: number) => {
          const currentGoal = u.monthlyVigGoals?.find((g: any) => g.monthKey === monthKey)
          const monthlyTarget = currentGoal?.profitGoal || 0
          
          return {
            id: u.id,
            name: u.name || u.email,
            role: u.role || "Sales Representative",
            expectedVig: 1.5,
            weeklyTarget: monthlyTarget / 4,
            monthlyTarget: monthlyTarget,
            gradient: REP_GRADIENTS[i % REP_GRADIENTS.length]
          }
        })

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
        dynamicReps.forEach((r: any) => {
          repsMap[r.id] = { 
            ...r, 
            weekly: { sales: [0,0,0,0,0], profit: [0,0,0,0,0], totalSales: 0, totalProfit: 0, dealsClosed: 0, commission: 0, invoices: [] },
            mtd: { sales: 0, profit: 0, commission: 0, dealsClosed: 0, invoices: [] },
            ytd: { sales: 0, profit: 0, commission: 0, dealsClosed: 0, invoices: [] }
          }
        })

        let teamWeekly = { sales: 0, profit: 0, commission: 0, target: dynamicReps.reduce((sum: number, r: any) => sum + r.weeklyTarget, 0) }
        const overdueInvoices: any[] = []
        
        let totalOverdueBalance = 0

        const invoices = payload.invoices || []
        invoices.forEach((inv: any) => {
          const spName = (inv.salesorder_salesperson_name || inv.salesperson_name || "").toUpperCase()
          if (spName.includes("PAUL") && (spName.includes("GENCUSKI") || spName.includes("GENKUSKI"))) return

          const saleDate = inv.salesorder_date || inv.date
          if (!saleDate) return

          const invDateObj = new Date(saleDate)
          const amount = Number(inv.sub_total !== undefined ? inv.sub_total : (inv.total || 0))
          const profit = Number(inv.cf_profit_unformatted || inv.custom_field_hash?.cf_profit_unformatted || 0)
          const commission = Number(inv.cf_commision_amount_unformatted || inv.custom_field_hash?.cf_commision_amount_unformatted || 0)
          const balance = Number(inv.balance !== undefined ? inv.balance : 0)

          // Check overdue
          const dueDate = inv.due_date ? new Date(inv.due_date) : null
          if (dueDate && inv.status === 'overdue' && balance > 0) {
             const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 3600 * 24))
             if (daysOverdue > 0) {
                totalOverdueBalance += balance
                overdueInvoices.push({
                   customer: inv.customer_name,
                   invoiceNumber: inv.invoice_number,
                   balance: balance,
                   saleDate: saleDate,
                   daysOverdue: daysOverdue,
                   repName: spName
                })
             }
          }

          const inCurrentWeek = weekDays.includes(saleDate)
          const isMTD = invDateObj.getFullYear() === currentYear && invDateObj.getMonth() === currentMonth
          const isYTD = invDateObj.getFullYear() === currentYear

          const matchedRep = Object.values(repsMap).find(r => r.name.toUpperCase().includes(spName) || spName.includes(r.name.toUpperCase()))
          
          if (inCurrentWeek) {
            teamWeekly.sales += amount
            teamWeekly.profit += profit
            teamWeekly.commission += commission
            if (matchedRep) {
               const dayIdx = weekDays.indexOf(saleDate)
               matchedRep.weekly.sales[dayIdx] += amount
               matchedRep.weekly.profit[dayIdx] += profit
               matchedRep.weekly.totalSales += amount
               matchedRep.weekly.totalProfit += profit
               matchedRep.weekly.commission += commission
               matchedRep.weekly.dealsClosed += 1
               matchedRep.weekly.invoices.push({ id: inv.invoice_id || inv.id, date: saleDate, customer: inv.customer_name, amount, profit, commission, invoiceNumber: inv.invoice_number })
            }
          }

          if (matchedRep) {
            if (isMTD) {
               matchedRep.mtd.sales += amount
               matchedRep.mtd.profit += profit
               matchedRep.mtd.commission += commission
               matchedRep.mtd.dealsClosed += 1
               matchedRep.mtd.invoices.push({ id: inv.invoice_id || inv.id, date: saleDate, customer: inv.customer_name, amount, profit, commission, invoiceNumber: inv.invoice_number })
            }
            if (isYTD) {
               matchedRep.ytd.sales += amount
               matchedRep.ytd.profit += profit
               matchedRep.ytd.commission += commission
               matchedRep.ytd.dealsClosed += 1
               matchedRep.ytd.invoices.push({ id: inv.invoice_id || inv.id, date: saleDate, customer: inv.customer_name, amount, profit, commission, invoiceNumber: inv.invoice_number })
            }
          }
        })

        setData({
          teamWeekly,
          reps: Object.values(repsMap),
          overdueInvoices: overdueInvoices.sort((a,b) => b.daysOverdue - a.daysOverdue),
          totalOverdueBalance,
          weekDays
        })

      } catch (err) {
        console.error("Sales Board Error:", err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
    const interval = setInterval(fetchData, 300000)
    return () => clearInterval(interval)
  }, [])

  // Auto-rotate screens
  useEffect(() => {
    if (isPaused) return
    let tickCount = progress
    const interval = setInterval(() => {
      tickCount += (TICK_INTERVAL / ROTATION_TIME) * 100
      if (tickCount >= 100) {
         tickCount = 0
         setCurrentScreen(prev => {
            const idx = SCREENS.indexOf(prev)
            return SCREENS[(idx + 1) % SCREENS.length]
         })
      }
      setProgress(tickCount)
    }, TICK_INTERVAL)
    return () => clearInterval(interval)
  }, [isPaused, progress])

  const nextScreen = () => {
     const idx = SCREENS.indexOf(currentScreen)
     setCurrentScreen(SCREENS[(idx + 1) % SCREENS.length])
     setProgress(0)
  }
  const prevScreen = () => {
     const idx = SCREENS.indexOf(currentScreen)
     setCurrentScreen(SCREENS[(idx - 1 + SCREENS.length) % SCREENS.length])
     setProgress(0)
  }
  const goToScreen = (screen: ScreenType) => {
     setCurrentScreen(screen)
     setProgress(0)
  }

  if (loading || !data) {
    return (
      <div className="w-full h-full min-h-[600px] flex flex-col items-center justify-center bg-[#0d0e12] rounded-2xl border border-white/10 text-white shadow-2xl relative overflow-hidden">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-neutral-400 font-medium tracking-widest uppercase text-sm animate-pulse">Loading Live Metrics</p>
      </div>
    )
  }

  const teamQuotaPct = data.teamWeekly.target > 0 ? Math.min(100, Math.round((data.teamWeekly.profit / data.teamWeekly.target) * 100)) : 0

  return (
    <div ref={boardRef} className="w-full h-full min-h-[700px] bg-[#09090b] rounded-2xl border border-white/5 text-white shadow-2xl relative flex flex-col font-sans overflow-hidden">
      
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/40 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <FiActivity size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-white uppercase">Titan Sales Monitor</h2>
            <p className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Sync
            </p>
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-4 bg-white/5 p-1.5 rounded-xl border border-white/10">
          <div className="flex items-center gap-1.5 px-2">
            {SCREENS.map(screen => (
              <button 
                key={screen} 
                onClick={() => goToScreen(screen)}
                title={screen}
                className={`h-2 rounded-full transition-all duration-500 ${currentScreen === screen ? "bg-emerald-400 w-6 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-white/20 hover:bg-white/40 w-2"}`}
              />
            ))}
          </div>
          <div className="w-[1px] h-4 bg-white/10"></div>
          <button onClick={prevScreen} className="text-neutral-400 hover:text-white transition-colors"><FiChevronLeft size={18} /></button>
          <button onClick={() => setIsPaused(!isPaused)} className="text-neutral-400 hover:text-white transition-colors">
            {isPaused ? <FiPlay size={16} /> : <FiPause size={16} />}
          </button>
          <button onClick={nextScreen} className="text-neutral-400 hover:text-white transition-colors"><FiChevronRight size={18} /></button>
          <div className="w-[1px] h-4 bg-white/10"></div>
          <button onClick={toggleFullscreen} className="text-neutral-400 hover:text-white transition-colors pr-2">
            {isFullscreen ? <FiMinimize size={16} /> : <FiMaximize size={16} />}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-white/5 relative z-20">
         <div className="h-full bg-emerald-500 transition-all duration-100 ease-linear" style={{ width: `${progress}%` }}></div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden bg-gradient-to-b from-black/20 to-transparent">
        
        {/* SCREEN 1: WEEKLY GRID */}
        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "WEEKLY_GRID" ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0 pointer-events-none"}`}>
          <div className="flex items-center justify-between mb-8">
             <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase flex items-center gap-2">
                <FiActivity className="text-emerald-400" /> Weekly Board
             </h3>
             <div className="text-right">
                <div className="text-2xl font-black text-white">{formatCurrency(data.teamWeekly.sales)}</div>
                <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Team Subtotal</div>
             </div>
          </div>

          <div className="flex-1 overflow-auto bg-white/[0.02] border border-white/5 rounded-2xl p-1">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-white/[0.03]">
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5">Sales Rep</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5">Metric</th>
                     {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, idx) => {
                        const dateParts = data.weekDays[idx].split('-')
                        return (
                           <th key={idx} className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">
                              {day} {dateParts[1]}/{dateParts[2]}
                           </th>
                        )
                     })}
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-emerald-400 border-b border-white/5 text-right bg-emerald-500/5 rounded-tr-xl">Week Total</th>
                  </tr>
               </thead>
               <tbody>
                  {data.reps.sort((a:any, b:any) => b.weekly.totalSales - a.weekly.totalSales).map((rep: any, idx: number) => {
                     const isExpanded = expandedRows.has(`weekly-${rep.id}`)
                     return (
                     <React.Fragment key={rep.id}>
                        {/* Sales Row */}
                        <tr className="group hover:bg-white/[0.02] cursor-pointer transition-colors" onClick={() => toggleRow(`weekly-${rep.id}`)}>
                           <td className="p-4 text-sm font-bold border-b border-white/5 text-white align-middle" rowSpan={2}>
                              <div className="flex items-center gap-3">
                                 <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${rep.gradient} flex items-center justify-center font-bold text-xs shadow-lg`}>{rep.name.charAt(0)}</div>
                                 {rep.name}
                              </div>
                           </td>
                           <td className="p-4 text-xs font-medium text-neutral-400 border-b border-white/5">Gross Sales</td>
                           {rep.weekly.sales.map((val: number, i: number) => (
                              <td key={i} className="p-4 text-sm font-medium text-white text-right border-b border-white/5">{val > 0 ? formatCurrency(val) : '-'}</td>
                           ))}
                           <td className="p-4 text-sm font-black text-emerald-400 text-right border-b border-white/5 bg-emerald-500/5">{formatCurrency(rep.weekly.totalSales)}</td>
                        </tr>
                        {/* Profit Row */}
                        <tr className="group hover:bg-white/[0.02] cursor-pointer transition-colors" onClick={() => toggleRow(`weekly-${rep.id}`)}>
                           <td className="p-4 text-xs font-medium text-neutral-500 border-b border-white/5">Dead Profit</td>
                           {rep.weekly.profit.map((val: number, i: number) => (
                              <td key={i} className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/5">{val > 0 ? formatCurrency(val) : '-'}</td>
                           ))}
                           <td className="p-4 text-sm font-bold text-emerald-400/70 text-right border-b border-white/5 bg-emerald-500/5">{formatCurrency(rep.weekly.totalProfit)}</td>
                        </tr>
                        {/* Commission Row */}
                        <tr className="group hover:bg-white/[0.02] cursor-pointer transition-colors" onClick={() => toggleRow(`weekly-${rep.id}`)}>
                           <td className="p-4 text-xs font-medium text-blue-500/70 border-b border-white/5">Commission</td>
                           {rep.weekly.profit.map((val: number, i: number) => (
                              <td key={i} className="p-4 text-sm font-medium text-blue-400/70 text-right border-b border-white/5">{rep.weekly.invoices?.filter((inv:any) => inv.date === data.weekDays[i]).reduce((sum:number, inv:any) => sum + inv.commission, 0) > 0 ? formatCurrency(rep.weekly.invoices?.filter((inv:any) => inv.date === data.weekDays[i]).reduce((sum:number, inv:any) => sum + inv.commission, 0)) : '-'}</td>
                           ))}
                           <td className="p-4 text-sm font-bold text-blue-400 text-right border-b border-white/5 bg-blue-500/5">{formatCurrency(rep.weekly.commission)}</td>
                        </tr>
                        {/* Deals Row */}
                        <tr className="group hover:bg-white/[0.02] cursor-pointer transition-colors" onClick={() => toggleRow(`weekly-${rep.id}`)}>
                           <td className="p-4 text-xs font-medium text-purple-500/70 border-b border-white/5">Deals Closed</td>
                           {rep.weekly.profit.map((val: number, i: number) => {
                              const count = rep.weekly.invoices?.filter((inv:any) => inv.date === data.weekDays[i]).length || 0;
                              return <td key={i} className="p-4 text-sm font-medium text-purple-400/70 text-right border-b border-white/5">{count > 0 ? count : '-'}</td>
                           })}
                           <td className="p-4 text-sm font-bold text-purple-400 text-right border-b border-white/5 bg-purple-500/5">{rep.weekly.dealsClosed}</td>
                        </tr>
                        {isExpanded && rep.weekly.invoices?.length > 0 && (
                           <tr className="bg-black/40">
                              <td colSpan={8} className="p-4 border-b border-white/5">
                                 <div className="pl-12">
                                   <table className="w-full text-left border-collapse bg-[#0d0e12] rounded-lg overflow-hidden border border-white/5">
                                     <thead>
                                       <tr className="bg-white/[0.02]">
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Date</th>
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Customer | Invoice</th>
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Gross Sales</th>
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Dead Profit</th>
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Commission</th>
                                       </tr>
                                     </thead>
                                     <tbody>
                                       {rep.weekly.invoices.map((inv:any) => (
                                         <tr key={inv.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                                           <td className="p-2 text-xs font-medium text-neutral-400">{inv.date}</td>
                                           <td className="p-2">
                                              <div className="text-xs font-bold text-white">{inv.customer}</div>
                                              <div className="text-[10px] text-neutral-500 font-medium">{inv.invoiceNumber}</div>
                                           </td>
                                           <td className="p-2 text-xs font-medium text-neutral-300 text-right">{formatCurrency(inv.amount)}</td>
                                           <td className="p-2 text-xs font-medium text-neutral-400 text-right">{formatCurrency(inv.profit)}</td>
                                           <td className="p-2 text-xs font-bold text-emerald-400 text-right">{formatCurrency(inv.commission)}</td>
                                         </tr>
                                       ))}
                                     </tbody>
                                   </table>
                                 </div>
                              </td>
                           </tr>
                        )}
                     </React.Fragment>
                  )})}
               </tbody>
            </table>
          </div>
        </div>

        {/* SCREEN 2: REPS KPIs */}
        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "REPS_KPI" ? "translate-x-0 opacity-100" : (SCREENS.indexOf(currentScreen) > 1 ? "-translate-x-full opacity-0 pointer-events-none" : "translate-x-full opacity-0 pointer-events-none")}`}>
          <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase mb-8 flex items-center gap-3">
            <FiStar className="text-amber-400" /> Weekly Top Performers
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-max">
            {data.reps.sort((a:any, b:any) => b.weekly.totalProfit - a.weekly.totalProfit).map((rep: any, idx: number) => {
              const quota = rep.weeklyTarget > 0 ? Math.min(100, Math.round((rep.weekly.totalProfit / rep.weeklyTarget) * 100)) : 0
              const profitMargin = rep.weekly.totalSales > 0 ? (rep.weekly.totalProfit / rep.weekly.totalSales) * 100 : 0
              return (
                <div key={rep.id} className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 relative overflow-hidden group">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${rep.gradient} flex items-center justify-center text-white font-black text-xl shadow-lg`}>
                        {rep.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-lg text-white">{rep.name}</h4>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider">{rep.role}</p>
                      </div>
                    </div>
                    {idx === 0 && <FiAward size={28} className="text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" />}
                  </div>
                  
                  <div className="space-y-5">
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-3xl font-black tracking-tight text-white">{formatCurrency(rep.weekly.totalProfit)}</div>
                        <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mt-1">Weekly Dead Profit</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold tracking-tight text-neutral-400">{formatCurrency(rep.weekly.totalSales)}</div>
                        <div className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest mt-1">Gross Sales</div>
                      </div>
                    </div>
                    <div className="w-full bg-white/5 h-2.5 rounded-full overflow-hidden border border-white/5 relative">
                      <div className="absolute inset-y-0 bg-white/10" style={{ left: '0', width: '100%' }}></div>
                      <div className={`absolute inset-y-0 bg-gradient-to-r ${rep.gradient} transition-all duration-1000`} style={{ left: '0', width: `${quota}%` }}></div>
                      {/* Target Indicator */}
                      <div className="absolute top-0 bottom-0 w-0.5 bg-white z-10" style={{ left: '100%' }}></div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-neutral-500 uppercase tracking-widest font-bold">
                       <span>{quota}% of Goal</span>
                       <span>Target: {formatCurrency(rep.weeklyTarget)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-2 border-t border-white/5">
                      <div>
                         <div className="text-lg font-bold text-white">{rep.weekly.dealsClosed}</div>
                         <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Deals</div>
                      </div>
                      <div>
                         <div className="text-lg font-bold text-emerald-400">{formatCurrency(rep.weekly.commission)}</div>
                         <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Comm</div>
                      </div>
                      <div>
                         <div className="text-lg font-bold text-white">{formatPercent(profitMargin)}</div>
                         <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Margin</div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* SCREEN 3: MTD */}
        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "MTD_STATS" ? "translate-x-0 opacity-100" : (SCREENS.indexOf(currentScreen) > 2 ? "-translate-x-full opacity-0 pointer-events-none" : "translate-x-full opacity-0 pointer-events-none")}`}>
           <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase mb-8 flex items-center gap-3">
            <FiTarget className="text-blue-400" /> Month-To-Date Performance
          </h3>
          <div className="flex-1 overflow-auto bg-white/[0.02] border border-white/5 rounded-2xl p-1">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-white/[0.03]">
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5">Sales Rep</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Gross Sales</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Dead Profit</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Commission</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Deals</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Avg Deal</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Dead Profit %</th>
                  </tr>
               </thead>
               <tbody>
                  {data.reps.sort((a:any, b:any) => b.mtd.profit - a.mtd.profit).map((rep: any) => {
                     const avgDeal = rep.mtd.dealsClosed > 0 ? rep.mtd.sales / rep.mtd.dealsClosed : 0
                     const profitMargin = rep.mtd.sales > 0 ? (rep.mtd.profit / rep.mtd.sales) * 100 : 0
                     const isExpanded = expandedRows.has(`mtd-${rep.id}`)
                     return (
                     <React.Fragment key={rep.id}>
                     <tr onClick={() => toggleRow(`mtd-${rep.id}`)} className="hover:bg-white/[0.05] transition-colors cursor-pointer group">
                        <td className="p-4 text-sm font-bold border-b border-white/5 text-white">
                           <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${rep.gradient} flex items-center justify-center font-bold text-[10px] shadow-lg`}>{rep.name.charAt(0)}</div>
                              {rep.name}
                           </div>
                        </td>
                        <td className="p-4 text-sm font-black text-white text-right border-b border-white/5">{formatCurrency(rep.mtd.sales)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-300 text-right border-b border-white/5">{formatCurrency(rep.mtd.profit)}</td>
                        <td className="p-4 text-sm font-bold text-emerald-400 text-right border-b border-white/5">{formatCurrency(rep.mtd.commission)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/5">{rep.mtd.dealsClosed}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/5">{formatCurrency(avgDeal)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/5">{formatPercent(profitMargin)}</td>
                     </tr>
                     {isExpanded && rep.mtd.invoices?.length > 0 && (
                        <tr className="bg-black/40">
                           <td colSpan={7} className="p-4 border-b border-white/5">
                              <div className="pl-12">
                                <table className="w-full text-left border-collapse bg-[#0d0e12] rounded-lg overflow-hidden border border-white/5">
                                  <thead>
                                    <tr className="bg-white/[0.02]">
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Date</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Customer | Invoice</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Gross Sales</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Dead Profit</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Commission</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rep.mtd.invoices.map((inv:any) => (
                                      <tr key={inv.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                                        <td className="p-2 text-xs font-medium text-neutral-400">{inv.date}</td>
                                        <td className="p-2">
                                           <div className="text-xs font-bold text-white">{inv.customer}</div>
                                           <div className="text-[10px] text-neutral-500 font-medium">{inv.invoiceNumber}</div>
                                        </td>
                                        <td className="p-2 text-xs font-medium text-neutral-300 text-right">{formatCurrency(inv.amount)}</td>
                                        <td className="p-2 text-xs font-medium text-neutral-400 text-right">{formatCurrency(inv.profit)}</td>
                                        <td className="p-2 text-xs font-bold text-emerald-400 text-right">{formatCurrency(inv.commission)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                           </td>
                        </tr>
                     )}
                     </React.Fragment>
                  )})}
               </tbody>
            </table>
          </div>
        </div>

        {/* SCREEN 4: YTD */}
        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "YTD_STATS" ? "translate-x-0 opacity-100" : (SCREENS.indexOf(currentScreen) > 3 ? "-translate-x-full opacity-0 pointer-events-none" : "translate-x-full opacity-0 pointer-events-none")}`}>
           <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase mb-8 flex items-center gap-3">
            <FiTrendingUp className="text-purple-400" /> Year-To-Date Performance
          </h3>
          <div className="flex-1 overflow-auto bg-white/[0.02] border border-white/5 rounded-2xl p-1">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-white/[0.03]">
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5">Sales Rep</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Gross Sales</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Dead Profit</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Commission</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Deals</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Avg Deal</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Dead Profit %</th>
                  </tr>
               </thead>
               <tbody>
                  {data.reps.sort((a:any, b:any) => b.ytd.profit - a.ytd.profit).map((rep: any) => {
                     const avgDeal = rep.ytd.dealsClosed > 0 ? rep.ytd.sales / rep.ytd.dealsClosed : 0
                     const profitMargin = rep.ytd.sales > 0 ? (rep.ytd.profit / rep.ytd.sales) * 100 : 0
                     const isExpanded = expandedRows.has(`ytd-${rep.id}`)
                     return (
                     <React.Fragment key={rep.id}>
                     <tr onClick={() => toggleRow(`ytd-${rep.id}`)} className="hover:bg-white/[0.05] transition-colors cursor-pointer group">
                        <td className="p-4 text-sm font-bold border-b border-white/5 text-white">
                           <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${rep.gradient} flex items-center justify-center font-bold text-[10px] shadow-lg`}>{rep.name.charAt(0)}</div>
                              {rep.name}
                           </div>
                        </td>
                        <td className="p-4 text-sm font-black text-white text-right border-b border-white/5">{formatCurrency(rep.ytd.sales)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-300 text-right border-b border-white/5">{formatCurrency(rep.ytd.profit)}</td>
                        <td className="p-4 text-sm font-bold text-emerald-400 text-right border-b border-white/5">{formatCurrency(rep.ytd.commission)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/5">{rep.ytd.dealsClosed}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/5">{formatCurrency(avgDeal)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/5">{formatPercent(profitMargin)}</td>
                     </tr>
                     {isExpanded && rep.ytd.invoices?.length > 0 && (
                        <tr className="bg-black/40">
                           <td colSpan={7} className="p-4 border-b border-white/5">
                              <div className="pl-12">
                                <table className="w-full text-left border-collapse bg-[#0d0e12] rounded-lg overflow-hidden border border-white/5">
                                  <thead>
                                    <tr className="bg-white/[0.02]">
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Date</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Customer | Invoice</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Gross Sales</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Dead Profit</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Commission</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rep.ytd.invoices.map((inv:any) => (
                                      <tr key={inv.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                                        <td className="p-2 text-xs font-medium text-neutral-400">{inv.date}</td>
                                        <td className="p-2">
                                           <div className="text-xs font-bold text-white">{inv.customer}</div>
                                           <div className="text-[10px] text-neutral-500 font-medium">{inv.invoiceNumber}</div>
                                        </td>
                                        <td className="p-2 text-xs font-medium text-neutral-300 text-right">{formatCurrency(inv.amount)}</td>
                                        <td className="p-2 text-xs font-medium text-neutral-400 text-right">{formatCurrency(inv.profit)}</td>
                                        <td className="p-2 text-xs font-bold text-emerald-400 text-right">{formatCurrency(inv.commission)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                           </td>
                        </tr>
                     )}
                     </React.Fragment>
                  )})}
               </tbody>
            </table>
          </div>
        </div>

        {/* SCREEN 5: OVERDUE INVOICES */}
        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "OVERDUE_INVOICES" ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
          
          <div className="grid grid-cols-3 gap-6 mb-8">
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 relative overflow-hidden group">
               <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent"></div>
               <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase mb-2">Total Overdue Balance</div>
               <div className="text-3xl font-black text-red-500">{formatCurrency(data.totalOverdueBalance)}</div>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 relative overflow-hidden">
               <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-2">Overdue Invoices</div>
               <div className="text-3xl font-black text-white">{data.overdueInvoices.length} <span className="text-sm font-medium text-neutral-500">Invoices</span></div>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 relative overflow-hidden">
               <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-2">Oldest Aging Invoice</div>
               <div className="text-3xl font-black text-white">
                  {data.overdueInvoices.length > 0 ? `${data.overdueInvoices[0].daysOverdue} ` : '0 '}
                  <span className="text-sm font-medium text-neutral-500">Days</span>
               </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white/[0.02] border border-white/5 rounded-2xl p-1">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-white/[0.03]">
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5">Sales Rep</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5">Customer | Invoice</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Overdue Balance</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/5 text-right">Sale Date</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-red-400 border-b border-white/5 text-right bg-red-500/5 rounded-tr-xl">Days Overdue</th>
                  </tr>
               </thead>
               <tbody>
                  {data.overdueInvoices.map((inv: any, idx: number) => {
                     const rep = data.reps.find((r:any) => r.name.toUpperCase() === inv.repName) || { name: inv.repName, gradient: 'from-neutral-600 to-neutral-800' }
                     return (
                     <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="p-4 text-sm font-bold border-b border-white/5 text-white">
                           <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${rep.gradient} flex items-center justify-center font-bold text-[10px] shadow-lg`}>{rep.name.charAt(0) || '?'}</div>
                              {rep.name}
                           </div>
                        </td>
                        <td className="p-4 border-b border-white/5">
                           <div className="text-sm font-bold text-white">{inv.customer}</div>
                           <div className="text-xs font-medium text-neutral-500">{inv.invoiceNumber}</div>
                        </td>
                        <td className="p-4 text-sm font-black text-white text-right border-b border-white/5">{formatCurrency(inv.balance)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/5">{inv.saleDate}</td>
                        <td className="p-4 text-sm font-bold text-red-400 text-right border-b border-white/5 bg-red-500/5">{inv.daysOverdue} Days</td>
                     </tr>
                  )})}
                  {data.overdueInvoices.length === 0 && (
                     <tr>
                        <td colSpan={5} className="p-8 text-center text-sm font-medium text-neutral-500">
                           <FiAlertCircle size={24} className="mx-auto mb-2 opacity-50" />
                           No overdue invoices found.
                        </td>
                     </tr>
                  )}
               </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Weekly Sales Banner */}
      <div className="bg-gradient-to-r from-emerald-900/30 to-teal-900/30 border-t border-emerald-500/20 px-6 py-4 flex items-center justify-between z-20 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 shadow-lg shadow-emerald-500/20">
            <FiDollarSign className="text-emerald-400 text-xl" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-widest text-white uppercase">Weekly Sales Totals</h3>
            <p className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Tracking
            </p>
          </div>
        </div>
        <div className="flex items-center gap-10">
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-0.5">Total Sales</div>
            <div className="text-2xl font-black text-emerald-400 drop-shadow-md">{formatCurrency(data.teamWeekly.sales)}</div>
          </div>
          <div className="w-[1px] h-8 bg-white/10"></div>
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-0.5">Total Profit</div>
            <div className="text-2xl font-black text-white">{formatCurrency(data.teamWeekly.profit)}</div>
          </div>
          <div className="w-[1px] h-8 bg-white/10"></div>
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-0.5">Total Commission</div>
            <div className="text-2xl font-black text-white">{formatCurrency(data.teamWeekly.commission)}</div>
          </div>
          <div className="w-[1px] h-8 bg-white/10"></div>
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-0.5">Weekly Quota</div>
            <div className="flex items-center gap-2">
               <div className="text-2xl font-black text-white">{teamQuotaPct}%</div>
               <div className="w-16 h-2 bg-black rounded-full overflow-hidden border border-white/10">
                 <div className="h-full bg-emerald-500" style={{ width: `${teamQuotaPct}%` }}></div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
