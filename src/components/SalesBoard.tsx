"use client"

import React, { useEffect, useState, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { FiTrendingUp, FiDollarSign, FiTarget, FiActivity, FiAward, FiClock, FiStar, FiMaximize, FiMinimize, FiPlay, FiPause, FiChevronLeft, FiChevronRight, FiAlertCircle, FiSliders } from "react-icons/fi"
import { getZohoBooksUrl } from "@/lib/zoho-urls"

const KpiBreakdownModal = dynamic(
  () => import("./KpiBreakdownModal").then((mod) => mod.KpiBreakdownModal),
  { ssr: false }
)

const SalesBoardCustomizer = dynamic(
  () => import("./SalesBoardCustomizer"),
  { ssr: false }
)

import { WidgetConfig, DEFAULT_WIDGET_LAYOUT } from "./SalesBoardCustomizer"
import { RevenueVsGoalWidget, VigCostAllocationWidget, PipelineFunnelWidget, ZDialerActivityWidget, TimeclockStatusWidget } from "./DashboardWidgetCatalog"
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'

import { useSalesBoardData, SCREENS, ScreenType } from "./useSalesBoardData"

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

export function SalesBoard() {
  const {
    data,
    loading,
    currentScreen,
    isFullscreen,
    isPaused,
    progress,
    expandedRows,
    isCustomizerOpen,
    setIsCustomizerOpen,
    widgets,
    kpiModalOpen,
    setKpiModalOpen,
    kpiModalTitle,
    kpiModalFormula,
    kpiModalDocs,
    boardRef,
    teamQuotaPct,
    handleUpdateWidgets,
    handleResetLayout,
    toggleRow,
    toggleFullscreen,
    nextScreen,
    prevScreen,
    goToScreen,
    setIsPaused
  } = useSalesBoardData()

  if (loading && !data) {
    return (
      <div className="w-full h-full min-h-[600px] flex flex-col items-center justify-center glass-panel-strong rounded-2xl border border-white/10 text-white shadow-2xl relative overflow-hidden p-8 space-y-8">
        <div className="w-full space-y-4">
          <Skeleton variant="card" className="w-1/3 h-8" />
          <div className="flex gap-4">
            <Skeleton variant="card" className="w-1/4 h-24" />
            <Skeleton variant="card" className="w-1/4 h-24" />
            <Skeleton variant="card" className="w-1/4 h-24" />
            <Skeleton variant="card" className="w-1/4 h-24" />
          </div>
          <Skeleton variant="table-row" className="w-full h-12" />
          <Skeleton variant="table-row" className="w-full h-12" />
          <Skeleton variant="table-row" className="w-full h-12" />
        </div>
      </div>
    )
  }

  if (!loading && data && (data.reps.length === 0 || data.rawInvoices.length === 0)) {
    const isNoReps = data.reps.length === 0;
    return (
      <div className="w-full h-full min-h-[600px] flex flex-col items-center justify-center glass-panel rounded-2xl border border-white/10 text-white shadow-2xl relative overflow-hidden p-8 space-y-4">
        <FiAlertCircle size={48} className="text-[var(--muted)] mb-2" />
        <h3 className="text-xl font-bold">No data available</h3>
        <p className="text-[var(--muted)] text-sm">{isNoReps ? "No reps found" : "No invoices this period"}.</p>
      </div>
    )
  }

  return (
    <div ref={boardRef} className="w-full h-full bg-black/20 rounded-2xl border border-white/10 text-white shadow-2xl relative flex flex-col font-sans overflow-hidden flex-1 min-h-0">
      
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40 backdrop-blur-md z-20">
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
          <button 
            onClick={() => setIsCustomizerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/30 transition-all shadow-[0_0_10px_rgba(52,211,153,0.15)]"
            title="Customize Dashboard Layout"
          >
            <FiSliders size={14} /> Customize Layout
          </button>
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
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
             <div>
                <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase flex items-center gap-2">
                   <FiActivity className="text-emerald-400 animate-pulse" /> Live Weekly Subtotal & Financial Performance
                </h3>
                <p className="text-[11px] text-neutral-500 font-semibold mt-0.5">
                  Pipeline: <span className="text-cyan-400 font-bold">48h Estimates</span> &amp; <span className="text-amber-400 font-bold">Uninvoiced Sales Orders</span>
                </p>
             </div>
             
             {/* --- 4-Badge Financial Metric Strip --- */}
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
                <div className="bg-gradient-to-br from-sky-950/60 to-blue-950/60 p-3 rounded-xl border border-sky-500/20 shadow-[0_0_15px_rgba(56,189,248,0.1)] hover:scale-[1.02] transition-transform">
                   <span className="text-[9px] uppercase font-bold text-sky-400 tracking-wider block">Subtotal</span>
                   <span className="text-base font-black text-white block mt-0.5">{formatCurrency(data.teamWeekly.sales)}</span>
                </div>
                <div className="bg-gradient-to-br from-amber-950/60 to-orange-950/60 p-3 rounded-xl border border-amber-500/20 shadow-[0_0_15px_rgba(251,191,36,0.1)] hover:scale-[1.02] transition-transform">
                   <span className="text-[9px] uppercase font-bold text-amber-400 tracking-wider block">DC (Subject VIG)</span>
                   <span className="text-base font-black text-amber-200 block mt-0.5">{formatCurrency(data.teamWeekly.deadCostSubjectToVig)}</span>
                </div>
                <div className="bg-gradient-to-br from-purple-950/60 to-fuchsia-950/60 p-3 rounded-xl border border-purple-500/20 shadow-[0_0_15px_rgba(232,121,249,0.1)] hover:scale-[1.02] transition-transform">
                   <span className="text-[9px] uppercase font-bold text-purple-300 tracking-wider block">🎁 DC (No VIG)</span>
                   <span className="text-base font-black text-purple-200 block mt-0.5">{formatCurrency(data.teamWeekly.deadCostNoVig)}</span>
                </div>
                <div className="bg-gradient-to-br from-emerald-950/60 to-teal-950/60 p-3 rounded-xl border border-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.1)] hover:scale-[1.02] transition-transform">
                   <span className="text-[9px] uppercase font-bold text-emerald-400 tracking-wider block">Net Profit</span>
                   <span className="text-base font-black text-emerald-300 block mt-0.5">{formatCurrency(data.teamWeekly.profit)}</span>
                </div>
             </div>
          </div>

          <div className="flex-1 overflow-auto bg-white/[0.02] border border-white/10 rounded-2xl p-1">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-white/[0.03]">
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10">Sales Rep</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10">Metric</th>
                     {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, idx) => {
                        const rawDate = (data?.weekDays && data.weekDays[idx]) ? String(data.weekDays[idx]) : ''
                        const dateParts = rawDate ? rawDate.split('-') : []
                        const dateStr = dateParts.length >= 3 ? `${dateParts[1]}/${dateParts[2]}` : ''
                        return (
                           <th key={idx} className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">
                              {day} {dateStr}
                           </th>
                        )
                     })}
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-emerald-400 border-b border-white/10 text-right bg-emerald-500/5 rounded-tr-xl">Week Total</th>
                  </tr>
               </thead>
               <tbody>
                  {(!data?.reps || data.reps.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="p-8">
                        <EmptyState 
                          title="No sales to display"
                          description="Sales will appear here once invoices are created."
                        />
                      </td>
                    </tr>
                  ) : (
                  (data?.reps || []).slice().sort((a:any, b:any) => (b.weekly?.totalSales || 0) - (a.weekly?.totalSales || 0)).map((rep: any, idx: number) => {
                     const isExpanded = expandedRows.has(`weekly-${rep.id}`)
                     return (
                     <React.Fragment key={rep.id}>
                        {/* Sales Row */}
                        <tr className="group hover:bg-white/10 hover:shadow-lg transition-all duration-300 cursor-pointer transition-colors" onClick={() => toggleRow(`weekly-${rep.id}`)}>
                           <td className="p-4 text-sm font-bold border-b border-white/10 text-white align-middle" rowSpan={2}>
                              <div className="flex items-center gap-3">
                                 <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${rep.gradient} flex items-center justify-center font-bold text-xs shadow-lg`}>{rep.name.charAt(0)}</div>
                                 {rep.name}
                              </div>
                           </td>
                           <td className="p-4 text-xs font-medium text-neutral-400 border-b border-white/10">Subtotal</td>
                           {rep.weekly.sales.map((val: number, i: number) => (
                              <td key={i} className="p-4 text-sm font-medium text-white text-right border-b border-white/10">{val > 0 ? formatCurrency(val) : '-'}</td>
                           ))}
                           <td className="p-4 text-sm font-black text-emerald-400 text-right border-b border-white/10 bg-emerald-500/5">{formatCurrency(rep.weekly.totalSales)}</td>
                        </tr>
                        {/* Profit Row */}
                        <tr className="group hover:bg-white/10 hover:shadow-lg transition-all duration-300 cursor-pointer transition-colors" onClick={() => toggleRow(`weekly-${rep.id}`)}>
                           <td className="p-4 text-xs font-medium text-neutral-500 border-b border-white/10">Dead Profit</td>
                           {rep.weekly.profit.map((val: number, i: number) => (
                              <td key={i} className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{val > 0 ? formatCurrency(val) : '-'}</td>
                           ))}
                           <td className="p-4 text-sm font-bold text-emerald-400/70 text-right border-b border-white/10 bg-emerald-500/5">{formatCurrency(rep.weekly.totalProfit)}</td>
                        </tr>

                        {isExpanded && rep.weekly.invoices?.length > 0 && (
                           <tr className="bg-black/40">
                              <td colSpan={8} className="p-4 border-b border-white/10">
                                 <div className="pl-12">
                                   <table className="w-full text-left border-collapse glass-panel-strong rounded-lg overflow-hidden border border-white/10">
                                     <thead>
                                       <tr className="bg-white/[0.02]">
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Date</th>
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Customer | Invoice</th>
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Subtotal</th>
                                         <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Dead Profit</th>
                                       </tr>
                                     </thead>
                                     <tbody>
                                       {rep.weekly.invoices.map((inv:any) => (
                                         <tr key={inv.id} className="border-t border-white/10 hover:bg-white/10 hover:shadow-lg transition-all duration-300 transition-colors">
                                           <td className="p-2 text-xs font-medium text-neutral-400">{inv.date}</td>
                                           <td className="p-2">
                                              <a 
                                                href={getZohoBooksUrl('invoices', inv.zohoId || inv.id)} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-xs font-bold text-white hover:text-emerald-400 hover:underline transition-colors block"
                                              >
                                                {inv.customer}
                                              </a>
                                              <a 
                                                href={getZohoBooksUrl('invoices', inv.zohoId || inv.id)} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-[10px] text-neutral-500 hover:text-emerald-400 hover:underline transition-colors font-medium"
                                              >
                                                {inv.invoiceNumber}
                                              </a>
                                           </td>
                                           <td className="p-2 text-xs font-medium text-neutral-300 text-right">{formatCurrency(inv.amount)}</td>
                                           <td className="p-2 text-xs font-medium text-neutral-400 text-right">{formatCurrency(inv.profit)}</td>
                                         </tr>
                                       ))}
                                     </tbody>
                                   </table>
                                 </div>
                              </td>
                           </tr>
                        )}
                     </React.Fragment>
                  )}))
                  }
               </tbody>
            </table>
          </div>
        </div>

        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "REPS_KPI" ? "translate-x-0 opacity-100" : (SCREENS.indexOf(currentScreen) > 1 ? "-translate-x-full opacity-0 pointer-events-none" : "translate-x-full opacity-0 pointer-events-none")}`}>
          <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase mb-4 flex items-center gap-3">
            <FiStar className="text-amber-400" /> Weekly Top Performers
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-max">
            {(data?.reps || []).slice().sort((a:any, b:any) => (b.weekly?.totalProfit || 0) - (a.weekly?.totalProfit || 0)).map((rep: any, idx: number) => {
              const quota = rep.weeklyTarget > 0 ? Math.min(100, Math.round((rep.weekly.totalProfit / rep.weeklyTarget) * 100)) : 0
              const profitMargin = rep.weekly.totalSales > 0 ? (rep.weekly.totalProfit / rep.weekly.totalSales) * 100 : 0
              return (
                <div key={rep.id} className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 relative overflow-hidden group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${rep.gradient} flex items-center justify-center text-white font-black text-lg shadow-lg`}>
                        {rep.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-white">{rep.name}</h4>
                        <p className="text-[9px] text-neutral-500 uppercase tracking-wider">{rep.role}</p>
                      </div>
                    </div>
                    {idx === 0 && <FiAward size={24} className="text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" />}
                  </div>
                  
                  <div className="space-y-3.5">
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-2xl font-black tracking-tight text-white">{formatCurrency(rep.weekly.totalProfit)}</div>
                        <div className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mt-0.5">Weekly Dead Profit</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold tracking-tight text-neutral-400">{formatCurrency(rep.weekly.totalSales)}</div>
                        <div className="text-[9px] text-neutral-600 font-bold uppercase tracking-widest mt-0.5">Subtotal</div>
                      </div>
                    </div>
                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/10 relative">
                      <div className="absolute inset-y-0 bg-white/10" style={{ left: '0', width: '100%' }}></div>
                      <div className={`absolute inset-y-0 bg-gradient-to-r ${rep.gradient} transition-all duration-1000`} style={{ left: '0', width: `${quota}%` }}></div>
                      {/* Target Indicator */}
                      <div className="absolute top-0 bottom-0 w-0.5 bg-white z-10" style={{ left: '100%' }}></div>
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-neutral-500 uppercase tracking-widest font-bold">
                       <span>{quota}% of Goal</span>
                       <span>Target: {formatCurrency(rep.weeklyTarget)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-1.5 border-t border-white/10 text-xs">
                      <div>
                        <span className="text-[8px] uppercase font-bold text-neutral-500 block">DC Subject to VIG</span>
                        <span className="text-amber-300 font-bold">{formatCurrency(rep.weekly.deadCostSubjectToVig)}</span>
                      </div>
                      <div>
                        <span className="text-[8px] uppercase font-bold text-purple-400 block">🎁 DC (No VIG)</span>
                        <span className="text-purple-300 font-bold">{formatCurrency(rep.weekly.deadCostNoVig)}</span>
                      </div>
                    </div>

                    {/* Active Pipeline Badges (48h Estimates & Uninvoiced SOs) */}
                    <div className="flex items-center gap-1.5 pt-1.5 border-t border-white/10">
                      <div className="flex-1 bg-cyan-950/40 p-1.5 rounded-lg border border-cyan-500/20 text-[9px]">
                        <span className="text-cyan-400 font-bold block uppercase">48h Estimates</span>
                        <span className="text-white font-bold">{rep.activePipeline.estimateCount} ({formatCurrency(rep.activePipeline.estimateAmount)})</span>
                      </div>
                      <div className="flex-1 bg-amber-950/40 p-1.5 rounded-lg border border-amber-500/20 text-[9px]">
                        <span className="text-amber-400 font-bold block uppercase">Uninvoiced SOs</span>
                        <span className="text-white font-bold">{rep.activePipeline.salesOrderCount} ({formatCurrency(rep.activePipeline.salesOrderAmount)})</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1.5 border-t border-white/10">
                      <div>
                         <div className="text-base font-bold text-white">{rep.weekly.dealsClosed}</div>
                         <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Deals</div>
                      </div>
                      <div>
                         <div className="text-base font-bold text-emerald-400">{formatPercent(profitMargin)}</div>
                         <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Margin</div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Dynamic Grid Layout for Custom Catalog Widgets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            {widgets.filter(w => w.visible).map(w => {
              const colClass = w.size === "3" ? "md:col-span-3" : w.size === "2" ? "md:col-span-2" : "md:col-span-1"
              if (w.id === "REVENUE_VS_GOAL") return <div key={w.id} className={colClass}><RevenueVsGoalWidget data={data} /></div>
              if (w.id === "VIG_COST_DONUT") return <div key={w.id} className={colClass}><VigCostAllocationWidget data={data} /></div>
              if (w.id === "PIPELINE_FUNNEL") return <div key={w.id} className={colClass}><PipelineFunnelWidget data={data} /></div>
              if (w.id === "ZDIALER_FEED") return <div key={w.id} className={colClass}><ZDialerActivityWidget data={data} /></div>
              if (w.id === "TIMECLOCK_STATUS") return <div key={w.id} className={colClass}><TimeclockStatusWidget data={data} /></div>
              return null
            })}
          </div>
        </div>

        {/* SCREEN 3: MTD */}
        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "MTD_STATS" ? "translate-x-0 opacity-100" : (SCREENS.indexOf(currentScreen) > 2 ? "-translate-x-full opacity-0 pointer-events-none" : "translate-x-full opacity-0 pointer-events-none")}`}>
           <div className="flex items-center justify-between mb-6">
             <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase flex items-center gap-3">
              <FiTarget className="text-blue-400" /> Month-To-Date Performance
            </h3>
            <span className="text-xs bg-blue-500/10 border border-blue-500/30 text-blue-400 font-bold px-3 py-1 rounded-full">
              Comparing Current MTD (Workday #{data.currentWorkdayIndex || 1}) vs. Last Month Pace & Final
            </span>
           </div>

          <div className="flex-1 overflow-auto bg-white/[0.02] border border-white/10 rounded-2xl p-1">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-white/[0.03]">
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10">Sales Rep</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Current MTD</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Last Month Pace (Workday #{data.currentWorkdayIndex || 1})</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Pace vs. Last Month</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Last Month Final</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Deals</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Profit %</th>
                  </tr>
               </thead>
               <tbody>
                  {(!data?.reps || data.reps.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="p-8">
                        <EmptyState 
                          title="No sales to display"
                          description="Sales will appear here once invoices are created."
                        />
                      </td>
                    </tr>
                  ) : (
                  (data?.reps || []).slice().sort((a:any, b:any) => (b.mtd?.profit || 0) - (a.mtd?.profit || 0)).map((rep: any) => {
                     const avgDeal = rep.mtd.dealsClosed > 0 ? rep.mtd.sales / rep.mtd.dealsClosed : 0
                     const profitMargin = rep.mtd.sales > 0 ? (rep.mtd.profit / rep.mtd.sales) * 100 : 0
                     const isExpanded = expandedRows.has(`mtd-${rep.id}`)

                     const paceDiff = rep.mtd.sales - (rep.lastMonthPace?.sales || 0)
                     const pacePct = (rep.lastMonthPace?.sales || 0) > 0 ? (paceDiff / rep.lastMonthPace.sales) * 100 : 0
                     const isAhead = paceDiff >= 0

                     const pctOfFinal = (rep.lastMonthFinal?.sales || 0) > 0 ? (rep.mtd.sales / rep.lastMonthFinal.sales) * 100 : 0

                     return (
                     <React.Fragment key={rep.id}>
                     <tr onClick={() => toggleRow(`mtd-${rep.id}`)} className="hover:bg-white/15 hover:shadow-lg transition-all duration-300 transition-colors cursor-pointer group">
                        <td className="p-4 text-sm font-bold border-b border-white/10 text-white">
                           <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${rep.gradient} flex items-center justify-center font-bold text-[10px] shadow-lg`}>{rep.name.charAt(0)}</div>
                              {rep.name}
                           </div>
                        </td>
                        <td className="p-4 text-right border-b border-white/10">
                          <div className="text-sm font-black text-white">{formatCurrency(rep.mtd.sales)}</div>
                          <div className="text-xs font-semibold text-emerald-400">{formatCurrency(rep.mtd.profit)} profit</div>
                        </td>
                        <td className="p-4 text-right border-b border-white/10">
                          <div className="text-sm font-bold text-neutral-300">{formatCurrency(rep.lastMonthPace?.sales || 0)}</div>
                          <div className="text-xs text-neutral-400">{formatCurrency(rep.lastMonthPace?.profit || 0)} profit</div>
                        </td>
                        <td className="p-4 text-right border-b border-white/10">
                          <div className={`text-sm font-bold ${isAhead ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isAhead ? '▲ +' : '▼ '}{formatCurrency(Math.abs(paceDiff))}
                          </div>
                          <div className={`text-xs font-semibold ${isAhead ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                            {isAhead ? '+' : ''}{pacePct.toFixed(1)}% vs. Pace
                          </div>
                        </td>
                        <td className="p-4 text-right border-b border-white/10">
                          <div className="text-sm font-bold text-neutral-300">{formatCurrency(rep.lastMonthFinal?.sales || 0)}</div>
                          <div className="text-xs text-blue-400 font-semibold">{pctOfFinal.toFixed(1)}% of Final</div>
                        </td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{rep.mtd.dealsClosed}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{formatPercent(profitMargin)}</td>
                     </tr>
                     {isExpanded && rep.mtd.invoices?.length > 0 && (
                        <tr className="bg-black/40">
                           <td colSpan={7} className="p-4 border-b border-white/10">
                              <div className="pl-12">
                                <table className="w-full text-left border-collapse glass-panel-strong rounded-lg overflow-hidden border border-white/10">
                                  <thead>
                                    <tr className="bg-white/[0.02]">
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Date</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Customer | Invoice</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Subtotal</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Dead Profit</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rep.mtd.invoices.map((inv:any) => (
                                      <tr key={inv.id} className="border-t border-white/10 hover:bg-white/10 hover:shadow-lg transition-all duration-300 transition-colors">
                                        <td className="p-2 text-xs font-medium text-neutral-400">{inv.date}</td>
                                        <td className="p-2">
                                           <a 
                                             href={getZohoBooksUrl('invoices', inv.zohoId || inv.id)} 
                                             target="_blank" 
                                             rel="noopener noreferrer"
                                             className="text-xs font-bold text-white hover:text-emerald-400 hover:underline transition-colors block"
                                           >
                                             {inv.customer}
                                           </a>
                                           <a 
                                             href={getZohoBooksUrl('invoices', inv.zohoId || inv.id)} 
                                             target="_blank" 
                                             rel="noopener noreferrer"
                                             className="text-[10px] text-neutral-500 hover:text-emerald-400 hover:underline transition-colors font-medium"
                                           >
                                             {inv.invoiceNumber}
                                           </a>
                                        </td>
                                        <td className="p-2 text-xs font-medium text-neutral-300 text-right">{formatCurrency(inv.amount)}</td>
                                        <td className="p-2 text-xs font-medium text-neutral-400 text-right">{formatCurrency(inv.profit)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                           </td>
                        </tr>
                     )}
                     </React.Fragment>
                  )}))
                  }
               </tbody>
            </table>
          </div>
        </div>

        {/* SCREEN 4: YTD */}
        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "YTD_STATS" ? "translate-x-0 opacity-100" : (SCREENS.indexOf(currentScreen) > 3 ? "-translate-x-full opacity-0 pointer-events-none" : "translate-x-full opacity-0 pointer-events-none")}`}>
           <h3 className="text-neutral-400 text-sm font-bold tracking-widest uppercase mb-8 flex items-center gap-3">
            <FiTrendingUp className="text-purple-400" /> Year-To-Date Performance
          </h3>
          <div className="flex-1 overflow-auto bg-white/[0.02] border border-white/10 rounded-2xl p-1">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-white/[0.03]">
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10">Sales Rep</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Gross Sales</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Dead Profit</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Deals</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Avg Deal</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Dead Profit %</th>
                  </tr>
               </thead>
               <tbody>
                  {(!data?.reps || data.reps.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="p-8">
                        <EmptyState 
                          title="No sales to display"
                          description="Sales will appear here once invoices are created."
                        />
                      </td>
                    </tr>
                  ) : (
                  (data?.reps || []).slice().sort((a:any, b:any) => (b.ytd?.profit || 0) - (a.ytd?.profit || 0)).map((rep: any) => {
                     const avgDeal = rep.ytd.dealsClosed > 0 ? rep.ytd.sales / rep.ytd.dealsClosed : 0
                     const profitMargin = rep.ytd.sales > 0 ? (rep.ytd.profit / rep.ytd.sales) * 100 : 0
                     const isExpanded = expandedRows.has(`ytd-${rep.id}`)
                     return (
                     <React.Fragment key={rep.id}>
                     <tr onClick={() => toggleRow(`ytd-${rep.id}`)} className="hover:bg-white/15 hover:shadow-lg transition-all duration-300 transition-colors cursor-pointer group">
                        <td className="p-4 text-sm font-bold border-b border-white/10 text-white">
                           <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${rep.gradient} flex items-center justify-center font-bold text-[10px] shadow-lg`}>{rep.name.charAt(0)}</div>
                              {rep.name}
                           </div>
                        </td>
                        <td className="p-4 text-sm font-black text-white text-right border-b border-white/10">{formatCurrency(rep.ytd.sales)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-300 text-right border-b border-white/10">{formatCurrency(rep.ytd.profit)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{rep.ytd.dealsClosed}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{formatCurrency(avgDeal)}</td>
                        <td className="p-4 text-sm font-medium text-neutral-400 text-right border-b border-white/10">{formatPercent(profitMargin)}</td>
                     </tr>
                     {isExpanded && rep.ytd.invoices?.length > 0 && (
                        <tr className="bg-black/40">
                           <td colSpan={6} className="p-4 border-b border-white/10">
                              <div className="pl-12">
                                <table className="w-full text-left border-collapse glass-panel-strong rounded-lg overflow-hidden border border-white/10">
                                  <thead>
                                    <tr className="bg-white/[0.02]">
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Date</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Customer | Invoice</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Subtotal</th>
                                      <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Dead Profit</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rep.ytd.invoices.map((inv:any) => (
                                      <tr key={inv.id} className="border-t border-white/10 hover:bg-white/10 hover:shadow-lg transition-all duration-300 transition-colors">
                                        <td className="p-2 text-xs font-medium text-neutral-400">{inv.date}</td>
                                        <td className="p-2">
                                           <a 
                                             href={getZohoBooksUrl('invoices', inv.zohoId || inv.id)} 
                                             target="_blank" 
                                             rel="noopener noreferrer"
                                             className="text-xs font-bold text-white hover:text-emerald-400 hover:underline transition-colors block"
                                           >
                                             {inv.customer}
                                           </a>
                                           <a 
                                             href={getZohoBooksUrl('invoices', inv.zohoId || inv.id)} 
                                             target="_blank" 
                                             rel="noopener noreferrer"
                                             className="text-[10px] text-neutral-500 hover:text-emerald-400 hover:underline transition-colors font-medium"
                                           >
                                             {inv.invoiceNumber}
                                           </a>
                                        </td>
                                        <td className="p-2 text-xs font-medium text-neutral-300 text-right">{formatCurrency(inv.amount)}</td>
                                        <td className="p-2 text-xs font-medium text-neutral-400 text-right">{formatCurrency(inv.profit)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                           </td>
                        </tr>
                     )}
                     </React.Fragment>
                  )}))
                  }
               </tbody>
            </table>
          </div>
        </div>

        {/* SCREEN 5: OVERDUE INVOICES */}
        <div className={`absolute inset-0 p-6 lg:p-8 flex flex-col transition-all duration-700 transform ${currentScreen === "OVERDUE_INVOICES" ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none"}`}>
          
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 relative overflow-hidden group">
               <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent"></div>
               <div className="text-[10px] font-bold text-red-400 tracking-widest uppercase mb-2">All-Time Overdue Balance</div>
               <div className="text-3xl font-black text-red-500">{formatCurrency(data.totalOverdueBalance)}</div>
            </div>
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 relative overflow-hidden">
               <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-2">Total Overdue Invoices</div>
               <div className="text-3xl font-black text-white">{data.totalOverdueCount || 0} <span className="text-sm font-medium text-neutral-500">Invoices</span></div>
            </div>
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 relative overflow-hidden">
               <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-2">Oldest Aging Invoice</div>
               <div className="text-3xl font-black text-white">
                  {data.maxSystemOverdueDays || 0} <span className="text-sm font-medium text-neutral-500">Days</span>
               </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white/[0.02] border border-white/10 rounded-2xl p-1">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-white/[0.03]">
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10">Sales Rep</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Total Overdue Balance</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-right">Overdue Invoices</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-red-400 border-b border-white/10 text-right">Oldest Days Overdue</th>
                     <th className="p-4 font-bold text-xs uppercase tracking-widest text-neutral-400 border-b border-white/10 text-center">Details</th>
                  </tr>
               </thead>
               <tbody>
                  {(!data?.repOverdueMap || Object.values(data.repOverdueMap).length === 0) ? (
                    <tr>
                      <td colSpan={5} className="p-8">
                        <EmptyState 
                          title="No overdue invoices"
                          description="You're all caught up!"
                        />
                      </td>
                    </tr>
                  ) : (
                  Object.values(data.repOverdueMap || {}).sort((a:any, b:any) => b.totalBalance - a.totalBalance).map((rep: any) => {
                     const isExpanded = expandedRows.has(`overdue-${rep.repId}`)
                     return (
                     <React.Fragment key={rep.repId}>
                     <tr onClick={() => toggleRow(`overdue-${rep.repId}`)} className="hover:bg-white/15 hover:shadow-lg transition-all duration-300 transition-colors cursor-pointer group">
                        <td className="p-4 text-sm font-bold border-b border-white/10 text-white">
                           <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${rep.gradient} flex items-center justify-center font-bold text-[10px] shadow-lg`}>{rep.repName.charAt(0) || '?'}</div>
                              {rep.repName}
                           </div>
                        </td>
                        <td className="p-4 text-sm font-black text-red-400 text-right border-b border-white/10">{formatCurrency(rep.totalBalance)}</td>
                        <td className="p-4 text-sm font-bold text-neutral-300 text-right border-b border-white/10">{rep.overdueCount} Invoices</td>
                        <td className="p-4 text-sm font-bold text-red-400 text-right border-b border-white/10">{rep.maxDaysOverdue} Days</td>
                        <td className="p-4 text-xs font-bold text-blue-400 text-center border-b border-white/10">
                          {isExpanded ? "▲ Hide Invoices" : "▼ View Invoices"}
                        </td>
                     </tr>
                     {isExpanded && rep.invoices?.length > 0 && (
                        <tr className="bg-black/40">
                           <td colSpan={5} className="p-4 border-b border-white/10">
                               <div className="pl-12">
                                 <table className="w-full text-left border-collapse glass-panel-strong rounded-lg overflow-hidden border border-white/10">
                                   <thead>
                                     <tr className="bg-white/[0.02]">
                                       <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Issue / Due Date</th>
                                       <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Customer | Invoice</th>
                                       <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Original Amount</th>
                                       <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Overdue Balance</th>
                                       <th className="p-2 text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-right">Aging Status</th>
                                     </tr>
                                   </thead>
                                   <tbody>
                                     {rep.invoices.sort((a:any,b:any) => b.daysOverdue - a.daysOverdue).map((inv:any) => (
                                       <tr key={inv.id} className="border-t border-white/10 hover:bg-white/10 hover:shadow-lg transition-all duration-300">
                                         <td className="p-2 text-xs font-medium text-neutral-400">
                                           <div>{inv.saleDate}</div>
                                           <div className="text-[10px] text-neutral-500">Due: {inv.dueDate}</div>
                                         </td>
                                         <td className="p-2">
                                            <a 
                                              href={getZohoBooksUrl('invoices', inv.zohoId || inv.id)} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="text-xs font-bold text-white hover:text-emerald-400 hover:underline transition-colors block"
                                            >
                                              {inv.customer}
                                            </a>
                                            <a 
                                              href={getZohoBooksUrl('invoices', inv.zohoId || inv.id)} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="text-[10px] text-neutral-500 hover:text-emerald-400 hover:underline transition-colors font-medium"
                                            >
                                              {inv.invoiceNumber}
                                            </a>
                                         </td>
                                         <td className="p-2 text-xs font-medium text-neutral-400 text-right">{formatCurrency(inv.amount)}</td>
                                         <td className="p-2 text-xs font-bold text-red-400 text-right">{formatCurrency(inv.balance)}</td>
                                         <td className="p-2 text-right">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                              inv.daysOverdue > 90 ? 'bg-red-500/20 border-red-500/40 text-red-400' :
                                              inv.daysOverdue > 30 ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' :
                                              'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
                                            }`}>
                                              {inv.daysOverdue} Days Overdue
                                            </span>
                                         </td>
                                       </tr>
                                     ))}
                                   </tbody>
                                 </table>
                               </div>
                            </td>
                         </tr>
                      )}
                      </React.Fragment>
                   )}))
                   }
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
            <h3 className="text-sm font-black tracking-widest text-white uppercase">Weekly Subtotal Totals</h3>
            <p className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Tracking
            </p>
          </div>
        </div>
        <div className="flex items-center gap-10">
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-0.5">Total Subtotal</div>
            <div className="text-2xl font-black text-emerald-400 drop-shadow-md">{formatCurrency(data.teamWeekly.sales)}</div>
          </div>
          <div className="w-[1px] h-8 bg-white/10"></div>
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-bold text-neutral-400 tracking-widest uppercase mb-0.5">Total Dead Profit</div>
            <div className="text-2xl font-black text-white">{formatCurrency(data.teamWeekly.profit)}</div>
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

      {/* KPI Derivation Document Breakdown Modal */}
      {kpiModalOpen && (
        <KpiBreakdownModal
          isOpen={kpiModalOpen}
          onClose={() => setKpiModalOpen(false)}
          title={kpiModalTitle}
          formula={kpiModalFormula}
          documents={kpiModalDocs}
        />
      )}

      {/* Dashboard Layout Customizer Modal */}
      {isCustomizerOpen && (
        <SalesBoardCustomizer
          isOpen={isCustomizerOpen}
          onClose={() => setIsCustomizerOpen(false)}
          widgets={widgets}
          onUpdateWidgets={handleUpdateWidgets}
          onReset={handleResetLayout}
        />
      )}
    </div>
  )
}

