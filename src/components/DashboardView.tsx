"use client"


import { useEffect, useState, useRef, useMemo } from "react"
import {
  FiTarget, FiDollarSign, FiTrendingUp, FiClock, FiLayers,
  FiArrowUpRight, FiArrowDownRight, FiCheckCircle, FiAlertCircle, FiTrendingDown,
  FiSliders, FiX, FiEye, FiEyeOff, FiAward, FiShoppingCart, FiFileText, FiRefreshCw, FiSearch, FiUsers, FiZap, FiPhoneCall, FiCalendar
} from "react-icons/fi"
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import { useZoho } from "@/components/ZohoProvider"
import { MetricDerivationModal, MetricDerivationInfo } from "@/components/MetricDerivationModal"
import { extractProfit, extractCommissionAmount, extractVigRate, extractDeadCostTotal, extractCustomFieldValue } from "@/lib/custom-field-extractor"
import { UpdateBanner } from '@/lib/useStaleCheck'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'


// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Types ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬

import { 
  useDashboardData, 
  DashboardViewProps, 
  DashboardData,
  RepWidgetConfig,
  CHART_COLORS,
  formatRepCurrency,
  formatRepDate,
  getStatusBadgeClass,
  buildMetricInfo
} from './useDashboardController'

// --- Custom Tooltip ---
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-panel rounded-lg px-3 py-2 text-xs border border-white/10">
      <p className="text-neutral-400 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="font-semibold">
          {entry.name}: ${(entry.value || 0).toLocaleString()}
        </p>
      ))}
    </div>
  )
}

// --- KPI Card ---
function KPICard({
  icon: Icon, title, value, subtitle, trend, trendUp, color, children, onClick
}: {
  icon: any; title: string; value: string; subtitle?: string;
  trend?: string; trendUp?: boolean; color: string; children?: React.ReactNode; onClick?: () => void
}) {
  return (
    <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }} 
      onClick={onClick}
      className={`glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-white/[0.2] transition-all duration-300 group relative overflow-hidden ${
        onClick ? "cursor-pointer hover:scale-[1.01] active:scale-[0.99]" : ""
      }`}
    >
      {/* Glow effect */}
      <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-[0.07] group-hover:opacity-[0.14] transition-opacity duration-500"
        style={{ background: `radial-gradient(circle, ${color}, transparent)` }} />
      
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-xl border transition-colors"
          style={{ background: `${color}15`, borderColor: `${color}30` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div className="flex items-center gap-1.5">
          {onClick && (
            <span className="text-[9px] font-bold tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 px-1.5 py-0.5 rounded text-neutral-300">
              Formula
            </span>
          )}
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg ${
              trendUp ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
            }`}>
              {trendUp ? <FiArrowUpRight size={12} /> : <FiArrowDownRight size={12} />}
              {trend}
            </div>
          )}
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-neutral-400 mb-1">{title}</p>
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        {subtitle && <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ Quota Ring ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬ÃƒÂ¢"Ã¢â€šÂ¬
function QuotaRing({ current, target, color }: { current: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
  const r = 36
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

  return (
    <div className="relative w-24 h-24 mt-2">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-black text-white">{Math.round(pct)}%</span>
        <span className="text-[10px] text-neutral-500">of goal</span>
      </div>
    </div>
  )
}


// ------ Main Dashboard Component ------
export function DashboardView({ repName, isAdmin, repEmail, triggerCustomize }: DashboardViewProps) {
  const hookData = useDashboardData({ repName, isAdmin, repEmail, triggerCustomize })
  const {
    currentUser,
    rawData, isLoading, isError, refetch,
    showCompanyWide, setShowCompanyWide,
    timeEntry, setTimeEntry,
    clockLoading, setClockLoading,
    selectedMetricInfo, setSelectedMetricInfo,
    rawInvoicesList, setRawInvoicesList,
    repWidgets, setRepWidgets,
    isRepCustomizerOpen, setIsRepCustomizerOpen,
    repStatsReps, setRepStatsReps,
    repStatsSelectedRepId, setRepStatsSelectedRepId,
    repStatsPeriod, setRepStatsPeriod,
    repStatsStartDate, setRepStatsStartDate,
    repStatsEndDate, setRepStatsEndDate,
    repStatsTotals, setRepStatsTotals,
    repStatsLoading, setRepStatsLoading,
    repStatsModalRep, setRepStatsModalRep,
    repStatsActiveTab, setRepStatsActiveTab,
    repStatsSearchQuery, setRepStatsSearchQuery,
    repStatsTileModalInfo, setRepStatsTileModalInfo,
    updateAvailable, setUpdateAvailable,
    refreshTrigger, setRefreshTrigger,
    companyTotals, setCompanyTotals,
    companyReps, setCompanyReps,
    companyLoading, setCompanyLoading,
    companyTileModal, setCompanyTileModal,
    data,
    repStatsAllInvoices,
    repStatsAllSalesOrders,
    handleUpdateRepWidgets,
    isVisible,
    calculateHours,
    handleToggleClock,
    checkForUpdates,
    fetchRepStatsData,
    fetchCompanyStats,
    goalPct,
    showTopPerformers,
    showCompanyBreakdown
  } = hookData

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="card" height="140px" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton variant="card" height="280px" />
          <Skeleton variant="card" height="280px" />
          <Skeleton variant="card" height="280px" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        icon={<span>Ã¢Å¡Â Ã¯Â¸Â</span>}
        title="Failed to load dashboard"
        description="There was an error loading your dashboard data. Please try again."
        action={<button onClick={() => refetch()} className="td-btn td-btn-primary">Retry</button>}
      />
    )
  }

  if (!data) {
    return (
      <EmptyState
        icon={<span>Ã°Å¸â€œÅ </span>}
        title="No data available"
        description="Dashboard data will appear once you have invoices and sales activity."
      />
    )
  }



  return (
    <div className="space-y-4 animate-fade-in">

      {/* --- Company Totals Banner --- */}
      {(
        <div className="glass-panel p-4 rounded-2xl border border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FiTarget size={18} />
            </div>
            <div>
              <p className="text-xs text-neutral-500 font-medium tracking-wider uppercase">Company Weekly Sales</p>
              <p className="text-xl font-bold text-white">${data.companyWeeklyTotal.toLocaleString()} <span className="text-sm font-normal text-neutral-400">/ ${data.weeklyTarget.toLocaleString()}</span></p>
            </div>
          </div>
          <div className="flex-1 w-full max-w-sm hidden md:block">
            <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500" 
                style={{ width: `${Math.min(100, (data.companyWeeklyTotal / data.weeklyTarget) * 100)}%` }} 
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <FiDollarSign size={18} />
            </div>
            <div>
              <p className="text-xs text-neutral-500 font-medium tracking-wider uppercase">Company MTD Sales</p>
              <p className="text-xl font-bold text-white">${data.companyMonthlyTotal.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}



      {/* --- Rep Performance & Financial Board Section --- */}
      <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5 space-y-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FiTrendingUp className="text-orange-400" /> Rep Performance &amp; Financial Board
            </h2>
            <p className="text-xs text-neutral-400">
              Evaluate Billed Invoices &amp; Sales Orders with exact commission calculations, VIG dead profit, and net totals.
            </p>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            <button
              onClick={fetchRepStatsData}
              disabled={repStatsLoading}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl border border-white/10 flex items-center gap-2 cursor-pointer transition-all"
            >
              <FiRefreshCw className={repStatsLoading ? "animate-spin" : ""} size={14} /> Refresh Data
            </button>
          </div>
        </div>

        {/* Filters Bar: Rep Selector (for Admin) & Date Periods */}
        <UpdateBanner show={updateAvailable} onUpdate={() => { setUpdateAvailable(false); setRefreshTrigger(n => n + 1) }} accentColor="orange" label="Dashboard data updated" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 bg-black/40 p-3.5 rounded-xl border border-white/5">
          {/* Admin Rep Selector Dropdown */}
          {isAdmin ? (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                <FiUsers /> Select View Scope
              </label>
              <select
                value={repStatsSelectedRepId}
                onChange={e => setRepStatsSelectedRepId(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value="all">Ã°Å¸Å’Å¸ All Representatives (Company Aggregate)</option>
                {repStatsReps.map((r: any) => (
                  <option key={r.repId} value={r.repName || r.email || r.repId}>
                    {r.repName} ({r.role || 'Sales'})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                <FiCalendar /> View Scope
              </label>
              <div className="flex items-center gap-2 pt-1">
                <span className="px-3 py-1.5 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-black flex items-center gap-1.5">
                  Ã°Å¸â€œÅ  {repName || currentUser?.name || "My Performance"}
                </span>
              </div>
            </div>
          )}

          <div className="lg:col-span-2 space-y-1">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
              <FiCalendar /> Date Range / Period
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "today", label: "Today" },
                { id: "this_week", label: "This Week" },
                { id: "this_month", label: "This Month (MTD)" },
                { id: "last_month", label: "Last Month" },
                { id: "this_year", label: "This Year (YTD)" },
                { id: "last_year", label: "Last Year" },
                { id: "all", label: "All Time" },
                { id: "custom", label: "Custom Range" },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setRepStatsPeriod(p.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    repStatsPeriod === p.id
                      ? "bg-orange-500 text-white shadow-md shadow-orange-500/20"
                      : "bg-neutral-800 text-neutral-400 hover:text-white"
                  }`}
                >
                  {p.id === "all" ? "Ã°Å¸Å’Å¸ " : ""}{p.label}
                </button>
              ))}
            </div>

            {repStatsPeriod === "custom" && (
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="date"
                  value={repStatsStartDate}
                  onChange={e => setRepStatsStartDate(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                />
                <span className="text-xs text-neutral-500">to</span>
                <input
                  type="date"
                  value={repStatsEndDate}
                  onChange={e => setRepStatsEndDate(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* INVOICES TOTALS SUMMARY (Interactive Clickable Tiles) */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
            <FiFileText /> Invoices Totals Summary (Click any tile to inspect documents)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
              onClick={() => setRepStatsTileModalInfo({ title: "Invoiced Sales Subtotals Breakdown", type: "invoices", docs: repStatsAllInvoices })}
              className="bg-neutral-900/60 border border-sky-500/20 hover:border-sky-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-sky-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Invoice Subtotals</span>
                <span className="text-[9px] font-bold text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Docs
                </span>
              </div>
              <p className="text-2xl font-black text-white">{formatRepCurrency(repStatsTotals.invoiceSubtotal)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">{repStatsTotals.invoiceCount} Invoices Billed</p>
            </div>

            <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
              onClick={() => setRepStatsTileModalInfo({ title: "Dead Profit (VIG) Breakdown", type: "invoices", docs: repStatsAllInvoices })}
              className="bg-neutral-900/60 border border-emerald-500/20 hover:border-emerald-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-emerald-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Dead Profit (VIG)</span>
                <span className="text-[9px] font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Docs
                </span>
              </div>
              <p className="text-2xl font-black text-emerald-400">{formatRepCurrency(repStatsTotals.invoiceDeadProfit)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">Gross profit before baseline</p>
            </div>

            <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
              onClick={() => setRepStatsTileModalInfo({ title: "Net Profit (After VIG) Breakdown", type: "invoices", docs: repStatsAllInvoices })}
              className="bg-neutral-900/60 border border-emerald-500/20 hover:border-emerald-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-emerald-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Net Profit (After VIG)</span>
                <span className="text-[9px] font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Docs
                </span>
              </div>
              <p className="text-2xl font-black text-emerald-400">{formatRepCurrency(repStatsTotals.invoiceNetProfit)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">Net profit after baseline VIG rate</p>
            </div>

            <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
              onClick={() => setRepStatsTileModalInfo({ title: "Invoice Commissions Breakdown", type: "invoices", docs: repStatsAllInvoices })}
              className="bg-neutral-900/60 border border-amber-500/20 hover:border-amber-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-amber-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1">
                  Ã°Å¸â€™Â° Invoice Commissions
                </span>
                <span className="text-[9px] font-bold text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Docs
                </span>
              </div>
              <p className="text-2xl font-black text-amber-400">{formatRepCurrency(repStatsTotals.invoiceCommission)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">50% Rep Earned Commissions</p>
            </div>
          </div>

          {/* COMPANY-WIDE TOTALS Ã¢â‚¬â€ uses separate all-reps fetch, admin-only clickable */}
          <div className="bg-black/40 border border-indigo-500/20 rounded-2xl p-4 space-y-3">
            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              Ã°Å¸ÂÂ¢ Company-Wide Totals
              <span className="text-[9px] font-medium text-neutral-600 normal-case tracking-normal">All reps Ã‚Â· same period</span>
              {companyLoading && <span className="text-[9px] text-indigo-500 animate-pulse">loadingÃ¢â‚¬Â¦</span>}
              {isAdmin && <span className="ml-auto text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">Admin: Click rows to inspect</span>}
            </h4>
            <div className="divide-y divide-white/5">
              {([
                { label: "Invoice Subtotals", value: formatRepCurrency(companyTotals.invoiceSubtotal), color: "text-white", type: "invoices" as const },
                { label: "Total Invoices Billed", value: companyTotals.invoiceCount, color: "text-sky-400", type: "invoices" as const },
                { label: "Dead Profit (VIG)", value: formatRepCurrency(companyTotals.invoiceDeadProfit), color: "text-emerald-400", type: "invoices" as const },
                { label: "Net Profit (After VIG)", value: formatRepCurrency(companyTotals.invoiceNetProfit), color: "text-emerald-300", type: "invoices" as const },
                { label: "Ã°Å¸â€™Â° Total Commissions Earned", value: formatRepCurrency(companyTotals.invoiceCommission), color: "text-amber-400", type: "invoices" as const },
              ] as { label: string; value: string | number; color: string; type: "invoices" | "salesOrders" }[]).map((row, i) => (
                <div
                  key={i}
                  onClick={isAdmin ? () => {
                    const allDocs = companyReps.flatMap((r: any) => (r.invoices || []).map((inv: any) => ({ ...inv, repName: r.repName })))
                    setCompanyTileModal({ title: `Company-Wide: ${row.label}`, type: row.type, docs: allDocs })
                  } : undefined}
                  className={`flex items-center justify-between py-2.5 rounded-lg px-2 -mx-2 transition-all ${
                    isAdmin ? "cursor-pointer hover:bg-indigo-500/10 hover:border hover:border-indigo-500/20" : "cursor-default"
                  }`}
                >
                  <span className="text-xs text-neutral-400 font-semibold">{row.label}</span>
                  <div className="flex items-center gap-2">
                    {isAdmin && <FiSearch size={9} className="text-indigo-400 opacity-40" />}
                    <span className={`text-sm font-black font-mono ${row.color}`}>{row.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SALES ORDERS TOTALS SUMMARY (Uninvoiced Only) */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
            <FiShoppingCart /> Uninvoiced Sales Orders Summary (Click any tile to inspect orders)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
              onClick={() => setRepStatsTileModalInfo({ title: "Sales Orders Subtotals Breakdown", type: "salesOrders", docs: repStatsAllSalesOrders })}
              className="bg-neutral-900/60 border border-purple-500/20 hover:border-purple-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Sales Order Subtotals</span>
                <span className="text-[9px] font-bold text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Orders
                </span>
              </div>
              <p className="text-2xl font-black text-white">{formatRepCurrency(repStatsTotals.salesOrderSubtotal)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">{repStatsTotals.salesOrderCount} Orders Created</p>
            </div>

            <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
              onClick={() => setRepStatsTileModalInfo({ title: "Sales Order Dead Profit Breakdown", type: "salesOrders", docs: repStatsAllSalesOrders })}
              className="bg-neutral-900/60 border border-purple-500/20 hover:border-purple-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Sales Order Dead Profit</span>
                <span className="text-[9px] font-bold text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Orders
                </span>
              </div>
              <p className="text-2xl font-black text-purple-300">{formatRepCurrency(repStatsTotals.salesOrderDeadProfit)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">Gross profit on orders</p>
            </div>

            <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
              onClick={() => setRepStatsTileModalInfo({ title: "Est. Order Commissions Breakdown", type: "salesOrders", docs: repStatsAllSalesOrders })}
              className="bg-neutral-900/60 border border-purple-500/20 hover:border-purple-500/60 p-5 rounded-2xl space-y-1 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-purple-300 tracking-wider flex items-center gap-1">
                  Ã°Å¸â€™Â¼ Est. Order Commissions
                </span>
                <span className="text-[9px] font-bold text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <FiSearch size={10} /> View Orders
                </span>
              </div>
              <p className="text-2xl font-black text-purple-300">{formatRepCurrency(repStatsTotals.salesOrderEstCommission)}</p>
              <p className="text-[10px] text-neutral-500 font-medium">Est. commission upon invoicing</p>
            </div>
          </div>
        </div>



        {/* Global Document Datapoints Table (Invoices & Sales Orders across reps) */}
        <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRepStatsActiveTab("invoices")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  repStatsActiveTab === "invoices"
                    ? "bg-sky-500 text-white shadow-md"
                    : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                Ã°Å¸â€œâ€ž All Invoices ({repStatsAllInvoices.length})
              </button>
              <button
                onClick={() => setRepStatsActiveTab("salesOrders")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  repStatsActiveTab === "salesOrders"
                    ? "bg-purple-600 text-white shadow-md"
                    : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                Ã°Å¸â€œÂ¦ Uninvoiced Sales Orders ({repStatsAllSalesOrders.length})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <FiSearch className="absolute left-3 top-2.5 text-neutral-500" size={14} />
              <input
                type="text"
                value={repStatsSearchQuery}
                onChange={e => setRepStatsSearchQuery(e.target.value)}
                placeholder="Search document # or customer..."
                className="w-full bg-black/50 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {repStatsActiveTab === "invoices" ? (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-neutral-400 uppercase text-[10px] tracking-wider bg-black/30">
                    <th className="p-3">Invoice #</th>
                    <th className="p-3">Issue Date</th>
                    <th className="p-3">Customer Account</th>
                    <th className="p-3">Salesperson</th>
                    <th className="p-3 text-right">Subtotal</th>
                    <th className="p-3 text-right">Dead Profit</th>
                    <th className="p-3 text-right text-amber-400 font-bold">Commission</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {repStatsAllInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-neutral-500">
                        No invoice datapoints found for the selected range.
                      </td>
                    </tr>
                  ) : (
                    repStatsAllInvoices.map((inv, idx) => (
                      <tr key={inv.id || idx} className="hover:bg-white/5 transition-colors">
                        <td className="p-3">
                          <a
                            href={inv.accountZohoId ? `/account?id=${inv.accountZohoId}&invoiceId=${inv.zohoId || inv.id}` : "#"}
                            className="font-mono font-bold text-sky-400 hover:text-sky-300 hover:underline transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            #{inv.invoiceNumber}
                          </a>
                        </td>
                        <td className="p-3 text-neutral-400">{formatRepDate(inv.date)}</td>
                        <td className="p-3 font-semibold text-white">{inv.customerName}</td>
                        <td className="p-3 text-neutral-300">{inv.repName}</td>
                        <td className="p-3 text-right font-mono font-bold text-white">{formatRepCurrency(inv.subtotal || 0)}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatRepCurrency(inv.deadProfit || 0)}</td>
                        <td className="p-3 text-right font-mono font-bold text-amber-400">{formatRepCurrency(inv.commission || 0)}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${getStatusBadgeClass(inv.status)}`}>
                            {inv.status || "paid"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-neutral-400 uppercase text-[10px] tracking-wider bg-black/30">
                    <th className="p-3">Sales Order #</th>
                    <th className="p-3">Order Date</th>
                    <th className="p-3">Customer Account</th>
                    <th className="p-3">Salesperson</th>
                    <th className="p-3 text-right">Subtotal</th>
                    <th className="p-3 text-right">Dead Profit</th>
                    <th className="p-3 text-right text-purple-300 font-bold">Est. Commission</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {repStatsAllSalesOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-neutral-500">
                        No sales order datapoints found for the selected range.
                      </td>
                    </tr>
                  ) : (
                    repStatsAllSalesOrders.map((so, idx) => (
                      <tr key={so.id || idx} className="hover:bg-white/5 transition-colors">
                        <td className="p-3">
                          <a
                            href={so.accountZohoId ? `/account?id=${so.accountZohoId}` : "#"}
                            className="font-mono font-bold text-purple-400 hover:text-purple-300 hover:underline transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            #{so.salesOrderNumber}
                          </a>
                        </td>
                        <td className="p-3 text-neutral-400">{formatRepDate(so.date)}</td>
                        <td className="p-3 font-semibold text-white">{so.customerName}</td>
                        <td className="p-3 text-neutral-300">{so.repName}</td>
                        <td className="p-3 text-right font-mono font-bold text-white">{formatRepCurrency(so.subtotal || 0)}</td>
                        <td className="p-3 text-right font-mono font-bold text-purple-300">{formatRepCurrency(so.deadProfit || 0)}</td>
                        <td className="p-3 text-right font-mono font-bold text-purple-300">{formatRepCurrency(so.estCommission || 0)}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${getStatusBadgeClass(so.status)}`}>
                            {so.status || "confirmed"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Rep Stats Tile Modal Inspection Popup */}
      {repStatsTileModalInfo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/20 rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FiFileText className={repStatsTileModalInfo.type === "invoices" ? "text-sky-400" : "text-purple-400"} />
                  {repStatsTileModalInfo.title}
                </h2>
                <p className="text-xs text-neutral-400">
                  Showing {repStatsTileModalInfo.docs.length} {repStatsTileModalInfo.type === "invoices" ? "invoice" : "sales order"} document(s) included in this total metric.
                </p>
              </div>
              <button
                onClick={() => setRepStatsTileModalInfo(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <FiX size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 border border-white/10 rounded-xl bg-black/40">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-neutral-900 text-neutral-400 uppercase text-[10px] sticky top-0 border-b border-white/10">
                  <tr>
                    <th className="p-3">{repStatsTileModalInfo.type === "invoices" ? "Invoice #" : "Sales Order #"}</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer Account</th>
                    <th className="p-3">Salesperson</th>
                    <th className="p-3 text-right">Subtotal</th>
                    <th className="p-3 text-right">Dead Profit</th>
                    <th className="p-3 text-right">{repStatsTileModalInfo.type === "invoices" ? "Commission" : "Est. Commission"}</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {repStatsTileModalInfo.docs.map((doc: any, idx: number) => (
                    <tr key={doc.id || idx} className="hover:bg-white/5">
                      <td className="p-3">
                        {doc.invoiceNumber ? (
                          <a
                            href={doc.accountZohoId ? `/account?id=${doc.accountZohoId}&invoiceId=${doc.zohoId || doc.id}` : "#"}
                            className="font-mono font-bold text-sky-400 hover:text-sky-300 hover:underline transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            #{doc.invoiceNumber}
                          </a>
                        ) : (
                          <a
                            href={doc.accountZohoId ? `/account?id=${doc.accountZohoId}` : "#"}
                            className="font-mono font-bold text-purple-400 hover:text-purple-300 hover:underline transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            #{doc.salesOrderNumber}
                          </a>
                        )}
                      </td>
                      <td className="p-3 text-neutral-400">{formatRepDate(doc.date)}</td>
                      <td className="p-3 font-semibold text-white">{doc.customerName}</td>
                      <td className="p-3 text-neutral-300">{doc.repName}</td>
                      <td className="p-3 text-right font-mono font-bold text-white">{formatRepCurrency(doc.subtotal || 0)}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatRepCurrency(doc.deadProfit || 0)}</td>
                      <td className="p-3 text-right font-mono font-bold text-amber-400">{formatRepCurrency(doc.commission || doc.estCommission || 0)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${getStatusBadgeClass(doc.status)}`}>
                          {doc.status || "completed"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10 shrink-0">
              <span className="text-xs text-neutral-400">Total Count: <strong className="text-white">{repStatsTileModalInfo.docs.length}</strong></span>
              <button
                onClick={() => setRepStatsTileModalInfo(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Company-Wide Admin Drill-Down Modal (admin-only) */}
      {companyTileModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-indigo-500/30 rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="text-indigo-400">Ã°Å¸ÂÂ¢</span>
                  {companyTileModal.title}
                </h2>
                <p className="text-xs text-neutral-400">
                  All {companyTileModal.docs.length} {companyTileModal.type === "invoices" ? "invoice" : "sales order"}(s) across all reps for the selected period.
                </p>
              </div>
              <button
                onClick={() => setCompanyTileModal(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <FiX size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 border border-white/10 rounded-xl bg-black/40">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-neutral-900 text-neutral-400 uppercase text-[10px] sticky top-0 border-b border-white/10">
                  <tr>
                    <th className="p-3">Invoice #</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Rep</th>
                    <th className="p-3 text-right">Subtotal</th>
                    <th className="p-3 text-right">Dead Profit</th>
                    <th className="p-3 text-right text-amber-400">Commission</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {companyTileModal.docs.length === 0 ? (
                    <tr><td colSpan={8} className="p-6 text-center text-neutral-500">No documents found for this period.</td></tr>
                  ) : companyTileModal.docs.map((doc: any, idx: number) => (
                    <tr key={doc.id || idx} className="hover:bg-white/5">
                      <td className="p-3">
                        <a href={doc.accountZohoId ? `/account?id=${doc.accountZohoId}&invoiceId=${doc.zohoId || doc.id}` : "#"} className="font-mono font-bold text-indigo-400 hover:text-indigo-300 hover:underline" onClick={e => e.stopPropagation()}>
                          #{doc.invoiceNumber || doc.id}
                        </a>
                      </td>
                      <td className="p-3 text-neutral-400">{formatRepDate(doc.date)}</td>
                      <td className="p-3 font-semibold text-white">{doc.customerName}</td>
                      <td className="p-3 text-neutral-300">{doc.repName}</td>
                      <td className="p-3 text-right font-mono font-bold text-white">{formatRepCurrency(doc.subtotal || 0)}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatRepCurrency(doc.deadProfit || 0)}</td>
                      <td className="p-3 text-right font-mono font-bold text-amber-400">{formatRepCurrency(doc.commission || 0)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${getStatusBadgeClass(doc.status)}`}>
                          {doc.status || "paid"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-white/10 shrink-0">
              <span className="text-xs text-neutral-400">Total: <strong className="text-white">{companyTileModal.docs.length}</strong> documents</span>
              <button onClick={() => setCompanyTileModal(null)} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rep Stats Individual Rep Breakdown Modal Popup */}
      {repStatsModalRep && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/20 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FiUsers className="text-orange-400" /> {repStatsModalRep.repName} Financial Breakdown
                </h2>
                <p className="text-xs text-neutral-400">Period: {repStatsPeriod.replace("_", " ").toUpperCase()}</p>
              </div>
              <button
                onClick={() => setRepStatsModalRep(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <FiX size={20} />
              </button>
            </div>

            {/* Modal KPI Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
              <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
                <p className="text-[10px] text-neutral-400 uppercase font-bold">Invoices Billed</p>
                <p className="text-lg font-bold text-white">{formatRepCurrency(repStatsModalRep.totals?.invoiceSubtotal || 0)}</p>
                <p className="text-[9px] text-neutral-500">{repStatsModalRep.totals?.invoiceCount || 0} Invoices</p>
              </div>

              <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
                <p className="text-[10px] text-neutral-400 uppercase font-bold">Dead Profit</p>
                <p className="text-lg font-bold text-emerald-400">{formatRepCurrency(repStatsModalRep.totals?.invoiceDeadProfit || 0)}</p>
              </div>

              <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
                <p className="text-[10px] text-neutral-400 uppercase font-bold">Earned Comm.</p>
                <p className="text-lg font-bold text-amber-400">{formatRepCurrency(repStatsModalRep.totals?.invoiceCommission || 0)}</p>
              </div>

              <div className="bg-black/40 border border-white/5 p-3 rounded-xl">
                <p className="text-[10px] text-neutral-400 uppercase font-bold">SO Est. Comm.</p>
                <p className="text-lg font-bold text-purple-300">{formatRepCurrency(repStatsModalRep.totals?.salesOrderEstCommission || 0)}</p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10 shrink-0">
              <button
                onClick={() => setRepStatsModalRep(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- KPI Cards --- */}
      {isVisible("KPI_CARDS") && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3">
        {/* Weekly Goal Progress */}
        <KPICard 
          icon={FiTarget} 
          title="Weekly Goal" 
          value={`$${data.weeklyTotal.toLocaleString()}`}
          subtitle={showCompanyWide ? `of $${data.weeklyTarget.toLocaleString()} target` : `This week's sales`} 
          color={CHART_COLORS.primary}
          trend={`${goalPct}%`} 
          trendUp={goalPct >= 50}
          onClick={() => setSelectedMetricInfo(buildMetricInfo("weeklyGoal", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        >
          <QuotaRing current={data.weeklyTotal} target={data.weeklyTarget} color={CHART_COLORS.primary} />
        </KPICard>

        {/* Total Revenue */}
        <KPICard 
          icon={FiDollarSign} 
          title="Total Revenue" 
          value={`$${data.monthlyTotal.toLocaleString()}`}
          subtitle="Month-to-Date Sales" 
          color={CHART_COLORS.primary}
          trend={`${data.monthlyDeals} deals`} 
          trendUp={true} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("totalRevenue", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        />
          
        {/* Monthly Profit */}
        <KPICard 
          icon={FiTrendingUp} 
          title="Monthly Profit" 
          value={`$${data.monthlyProfit.toLocaleString()}`}
          subtitle={`Commission: $${data.monthlyCommission.toLocaleString()}`} 
          color={CHART_COLORS.purple} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("monthlyProfit", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        />
          
        {/* Timeclock */}
        <KPICard 
          icon={FiClock} 
          title="Timeclock" 
          value={(!timeEntry || timeEntry.manualClockOut) ? "Off Clock" : `${calculateHours(timeEntry)}h`}
          color={(!timeEntry || timeEntry.manualClockOut) ? CHART_COLORS.text : CHART_COLORS.accent}
          onClick={() => setSelectedMetricInfo(buildMetricInfo("timeclock", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        >
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleClock(); }}
            disabled={clockLoading}
            className={`mt-3 w-full text-xs font-bold py-2 rounded-xl border transition-all duration-300 ${
              (!timeEntry || timeEntry.manualClockOut)
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                : "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
            } disabled:opacity-50`}
          >
            {clockLoading ? "..." : (!timeEntry || timeEntry.manualClockOut) ? "Clock In" : "Clock Out"}
          </button>
        </KPICard>

        {/* Deals Won */}
        <KPICard 
          icon={FiCheckCircle} 
          title="Deals Won" 
          value={`${data.dealsWon}`}
          subtitle="Total successful deals" 
          color={CHART_COLORS.accent} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("dealsWon", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        />

        {/* Deals Lost */}
        <KPICard 
          icon={FiAlertCircle} 
          title="Deals Lost" 
          value={`${data.dealsLost}`}
          subtitle="Total void/lost deals" 
          color={CHART_COLORS.rose} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("dealsLost", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        />

        {/* Avg Deal Size */}
        <KPICard 
          icon={FiTrendingUp} 
          title="Avg Deal Size" 
          value={`$${data.avgDealSize.toLocaleString()}`}
          subtitle="Revenue per won deal" 
          color={CHART_COLORS.sky} 
          onClick={() => setSelectedMetricInfo(buildMetricInfo("avgDealSize", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        />

        {/* Pipeline */}
        <KPICard 
          icon={FiLayers} 
          title="Active Pipeline" 
          value={`$${data.pipelineValue.toLocaleString()}`}
          subtitle={`${data.pipelineCount} open invoices`} 
          color={CHART_COLORS.sky}
          onClick={() => setSelectedMetricInfo(buildMetricInfo("activePipeline", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
        >
          {data.overdueCount > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
              <FiAlertCircle size={12} />
              <span>{data.overdueCount} overdue (${data.overdueBalance.toLocaleString()})</span>
            </div>
          )}
        </KPICard>
      </div>
      )}

      {/* --- Goal Progress & 1.5x VIG Penalty Tracker --- */}
      {isVisible("GOAL_TRACKERS") && (
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <FiTarget size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Monthly Goal Progress & VIG Tracker
              </h3>
              <p className="text-xs text-neutral-400">
                Track progress towards monthly goals and monitor your VIG tier rate.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.currentVigRate >= 1.45 ? (
              <span className="px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5 shadow-lg shadow-red-900/20">
                <FiAlertCircle size={14} /> 1.5x VIG Penalty Active
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-lg shadow-emerald-900/20">
                <FiCheckCircle size={14} /> 1.3x Standard VIG Active
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Monthly Profit Goal Progress */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-neutral-300 uppercase tracking-wider">Monthly Profit Goal</span>
              <span className="font-mono font-bold text-purple-400">
                ${data.monthlyProfit.toLocaleString()} / ${data.monthlyProfitGoal.toLocaleString()}
              </span>
            </div>
            <div className="h-3 w-full bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/5">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, Math.round((data.monthlyProfit / (data.monthlyProfitGoal || 1)) * 100))}%` }} 
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-neutral-400">
              <span>Completion: {Math.round((data.monthlyProfit / (data.monthlyProfitGoal || 1)) * 100)}%</span>
              <span className="text-purple-300 font-semibold">
                {data.monthlyProfit >= data.monthlyProfitGoal ? "Goal Reached! Ã°Å¸Å½â€°" : `$${(data.monthlyProfitGoal - data.monthlyProfit).toLocaleString()} remaining`}
              </span>
            </div>
          </div>

          {/* Monthly Subtotal Goal Progress */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-neutral-300 uppercase tracking-wider">Monthly Subtotal Goal</span>
              <span className="font-mono font-bold text-sky-400">
                ${data.monthlyTotal.toLocaleString()} / ${data.monthlySubtotalGoal.toLocaleString()}
              </span>
            </div>
            <div className="h-3 w-full bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/5">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, Math.round((data.monthlyTotal / (data.monthlySubtotalGoal || 1)) * 100))}%` }} 
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-neutral-400">
              <span>Completion: {Math.round((data.monthlyTotal / (data.monthlySubtotalGoal || 1)) * 100)}%</span>
              <span className="text-sky-300 font-semibold">
                {data.monthlyTotal >= data.monthlySubtotalGoal ? "Goal Reached! Ã°Å¸Å½â€°" : `$${(data.monthlySubtotalGoal - data.monthlyTotal).toLocaleString()} remaining`}
              </span>
            </div>
          </div>

          {/* Money Lost (1.5x VIG Penalty) Box */}
          <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }} 
            onClick={() => setSelectedMetricInfo(buildMetricInfo("vigPenalty", data, timeEntry, repName, repEmail, rawInvoicesList, isAdmin))}
            className={`p-4 rounded-xl border cursor-pointer transition-all hover:scale-[1.01] ${
              data.monthlyVigPenaltyLoss > 0 || data.currentVigRate >= 1.45
                ? 'bg-gradient-to-br from-red-950/40 via-rose-900/20 to-black/60 border-red-500/40 shadow-lg shadow-red-950/30'
                : 'bg-gradient-to-br from-emerald-950/20 via-black/40 to-black/60 border-emerald-500/20'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${data.monthlyVigPenaltyLoss > 0 || data.currentVigRate >= 1.45 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  <FiTrendingDown size={16} />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-200">
                  Money Lost (1.5x VIG)
                </span>
              </div>
              <span className="text-[10px] text-neutral-400 underline">Details Ã¢â€ â€™</span>
            </div>

            <div className="text-2xl font-black font-mono tracking-tight text-white mb-1">
              {data.monthlyVigPenaltyLoss > 0 
                ? `-$${data.monthlyVigPenaltyLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `$0.00`
              }
            </div>

            <p className="text-[11px] text-neutral-400 leading-tight">
              {data.monthlyVigPenaltyLoss > 0 || data.currentVigRate >= 1.45
                ? "Lost this month due to 1.5x VIG penalty rate from not hitting last month's goal."
                : "Standard 1.3x VIG rate maintained Ã¢â‚¬â€ no penalty losses this month!"
              }
            </p>
          </div>
        </div>
      </div>
      )}

      {/* --- Charts Row 1: Revenue & Status --- */}
      {isVisible("CHARTS_REVENUE_RATIO") && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Revenue vs Goal -- spans 2 cols */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">Revenue vs Goal</h3>
              <p className="text-xs text-neutral-500">Trailing 6 months</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_COLORS.primary }} /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_COLORS.muted }} /> Goal</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            {data.revenueByMonth.length === 0 ? (
              <EmptyState title="No Revenue Data" description="There is no revenue data to display for the current period." />
            ) : (
              <BarChart data={data.revenueByMonth} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="goal" fill={CHART_COLORS.muted} radius={[4, 4, 0, 0]} name="Goal" />
                <Bar dataKey="revenue" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} name="Revenue" />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Win/Loss Ratio Chart */}
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-1">Win/Loss Ratio</h3>
          <p className="text-xs text-neutral-500 mb-3">Overall deal success</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data.winLossData} cx="50%" cy="50%" innerRadius={50} outerRadius={72}
                paddingAngle={3} dataKey="value" strokeWidth={0}>
                {data.winLossData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div className="glass-panel rounded-lg px-3 py-2 text-xs border border-white/10">
                    <p style={{ color: d.color }} className="font-semibold">{d.name}: {d.value} Deals</p>
                  </div>
                )
              }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {data.winLossData.map((d, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs text-neutral-400 font-semibold">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                {d.name} ({d.value})
              </span>
            ))}
          </div>
        </div>

        {/* Deal Status Donut */}
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-1">Deals by Status</h3>
          <p className="text-xs text-neutral-500 mb-3">Current distribution</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data.dealsByStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={72}
                paddingAngle={3} dataKey="value" strokeWidth={0}>
                {data.dealsByStatus.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div className="glass-panel rounded-lg px-3 py-2 text-xs border border-white/10">
                    <p style={{ color: d.color }} className="font-semibold">{d.name}: {d.value}</p>
                  </div>
                )
              }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-2">
            {data.dealsByStatus.map((d, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs text-neutral-400">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                {d.name} ({d.value})
              </span>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* --- Charts Row 2: Weekly Trend & Commission --- */}
      {isVisible("CHARTS_TRENDS") && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Weekly Sales Trend */}
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-1">Weekly Sales Trend</h3>
          <p className="text-xs text-neutral-500 mb-4">Daily sales & profit this week</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.weeklyTrend}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.accent} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="sales" stroke={CHART_COLORS.primary} fill="url(#salesGrad)"
                strokeWidth={2} name="Sales" dot={{ r: 3, fill: CHART_COLORS.primary }} />
              <Area type="monotone" dataKey="profit" stroke={CHART_COLORS.accent} fill="url(#profitGrad)"
                strokeWidth={2} name="Profit" dot={{ r: 3, fill: CHART_COLORS.accent }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Avg Deal Size Trend */}
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-1">Avg Deal Size Trend</h3>
          <p className="text-xs text-neutral-500 mb-4">Trailing 6 months</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.avgDealSizeTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="avgSize" stroke={CHART_COLORS.sky} strokeWidth={3} 
                name="Avg Deal Size" dot={{ r: 4, fill: CHART_COLORS.sky }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Commission Earned */}
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-1">Commission Earned</h3>
          <p className="text-xs text-neutral-500 mb-4">Trailing 6 months</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.commissionByMonth}>
              <defs>
                <linearGradient id="commGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.purple} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.purple} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="commission" stroke={CHART_COLORS.purple} fill="url(#commGrad)"
                strokeWidth={2} name="Commission" dot={{ r: 3, fill: CHART_COLORS.purple }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Top Performers (admin only) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {showTopPerformers && isVisible("LEADERBOARD") && (
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-4">Top Performers -- This Month</h3>
          {data.topReps.length === 0 ? (
            <EmptyState title="No Top Performers" description="No rep data available." />
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {data.topReps.map((rep, i) => {
              const quotaPct = rep.quota > 0 ? Math.min((rep.sales / (rep.quota * 4)) * 100, 100) : 0
              return (
                <div key={i} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.12] transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black"
                      style={{
                        background: i === 0 ? `linear-gradient(135deg, ${CHART_COLORS.primary}, ${CHART_COLORS.amber})`
                          : i === 1 ? `linear-gradient(135deg, ${CHART_COLORS.accent}, ${CHART_COLORS.sky})`
                          : "rgba(255,255,255,0.06)",
                        color: i < 2 ? "#000" : CHART_COLORS.text
                      }}>
                      {i === 0 ? "Ã°Å¸Â¥Ë†Ã¢â‚¬Â¡" : i === 1 ? "Ã°Å¸Â¥Ë†" : i + 1}
                    </div>
                    <span className="text-xs font-bold text-white truncate">{rep.name}</span>
                  </div>
                  <p className="text-lg font-black text-white">${rep.sales.toLocaleString()}</p>
                  <div className="mt-2 w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${quotaPct}%`,
                        background: `linear-gradient(90deg, ${CHART_COLORS.primary}, ${CHART_COLORS.amber})`
                      }} />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-neutral-500">
                    <span>Profit: ${rep.profit.toLocaleString()}</span>
                    <span>{rep.deals} deals</span>
                  </div>
                </div>
              )
            })}
          </div>
          )}
        </div>
      )}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Company Breakdown (admin only) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {showCompanyBreakdown && isVisible("LEADERBOARD") && data.allRepData.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-bold text-white mb-4">Company Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-neutral-500 font-semibold uppercase tracking-wider py-2 pr-4">Rep Name</th>
                  <th className="text-right text-neutral-500 font-semibold uppercase tracking-wider py-2 px-4">Weekly Sales</th>
                  <th className="text-right text-neutral-500 font-semibold uppercase tracking-wider py-2 px-4">MTD Sales</th>
                  <th className="text-right text-neutral-500 font-semibold uppercase tracking-wider py-2 px-4">MTD Profit</th>
                  <th className="text-right text-neutral-500 font-semibold uppercase tracking-wider py-2 px-4">MTD Commission</th>
                  <th className="text-right text-neutral-500 font-semibold uppercase tracking-wider py-2 pl-4">Deals</th>
                </tr>
              </thead>
              <tbody>
                {data.allRepData.map((row, i) => (
                  <tr key={i} className="border-b border-white/[0.03] hover:bg-white/10 hover:shadow-lg transition-all duration-300 transition-colors">
                    <td className="py-2.5 pr-4 font-semibold text-white">{row.name}</td>
                    <td className="py-2.5 px-4 text-right text-neutral-300">${row.weeklySales.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right text-neutral-300">${row.mtdSales.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right text-neutral-300">${row.mtdProfit.toLocaleString()}</td>
                    <td className="py-2.5 px-4 text-right text-neutral-300">${row.mtdCommission.toLocaleString()}</td>
                    <td className="py-2.5 pl-4 text-right text-neutral-300">{row.deals}</td>
                  </tr>
                ))}
                {/* Company Totals */}
                <tr className="border-t border-white/[0.1]">
                  <td className="py-2.5 pr-4 font-black text-white uppercase tracking-wider">Total</td>
                  <td className="py-2.5 px-4 text-right font-bold text-white">
                    ${data.allRepData.reduce((sum, r) => sum + r.weeklySales, 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-white">
                    ${data.allRepData.reduce((sum, r) => sum + r.mtdSales, 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-white">
                    ${data.allRepData.reduce((sum, r) => sum + r.mtdProfit, 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-white">
                    ${data.allRepData.reduce((sum, r) => sum + r.mtdCommission, 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 pl-4 text-right font-bold text-white">
                    {data.allRepData.reduce((sum, r) => sum + r.deals, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- Metric Derivation Explanation Modal --- */}
      <MetricDerivationModal
        info={selectedMetricInfo}
        onClose={() => setSelectedMetricInfo(null)}
      />

      {/* --- Rep Dashboard Layout Customizer Modal --- */}
      <RepDashboardCustomizer
        isOpen={isRepCustomizerOpen}
        onClose={() => setIsRepCustomizerOpen(false)}
        widgets={repWidgets}
        onUpdateWidgets={handleUpdateRepWidgets}
      />
    </div>
  )
}


interface RepDashboardCustomizerProps {
  isOpen: boolean
  onClose: () => void
  widgets: RepWidgetConfig[]
  onUpdateWidgets: (updated: RepWidgetConfig[]) => void
}

function RepDashboardCustomizer({ isOpen, onClose, widgets, onUpdateWidgets }: RepDashboardCustomizerProps) {
  if (!isOpen) return null

  const toggleVisibility = (id: string) => {
    const updated = widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w)
    onUpdateWidgets(updated)
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }} 
        className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-white">Customize Home Dashboard</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <FiX className="text-lg" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-neutral-400 leading-relaxed">
            Select the metrics, goals, and graphs you would like to display on your performance dashboard.
          </p>
          <div className="space-y-2">
            {widgets.map(w => (
              <div 
                key={w.id} 
                className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors"
              >
                <div>
                  <span className="text-xs font-bold text-white block">{w.title}</span>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Widget ID: {w.id}</span>
                </div>
                <button
                  onClick={() => toggleVisibility(w.id)}
                  className={`p-2 rounded-lg transition-colors ${
                    w.visible 
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20" 
                      : "bg-neutral-800 text-neutral-500 border border-neutral-700/50 hover:bg-neutral-700"
                  }`}
                >
                  {w.visible ? <FiEye size={14} /> : <FiEyeOff size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  )
}

