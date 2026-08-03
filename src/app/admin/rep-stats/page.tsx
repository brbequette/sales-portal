"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import {
  FiBarChart2, FiDollarSign, FiUsers, FiCalendar, FiFilter,
  FiFileText, FiShoppingCart, FiSearch, FiRefreshCw, FiChevronRight,
  FiChevronDown, FiChevronUp, FiX, FiCheckCircle, FiClock, FiAlertCircle
} from "react-icons/fi"

function formatCurrency(amount: number): string {
  return `$${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "N/A"
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return dateStr
  }
}

export default function AdminRepStatsPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [reps, setReps] = useState<any[]>([])
  const [selectedRepId, setSelectedRepId] = useState<string>("all")
  const [period, setPeriod] = useState<string>("this_month")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [totals, setTotals] = useState<any>({
    invoiceCount: 0,
    invoiceSubtotal: 0,
    invoiceDeadProfit: 0,
    salesOrderCount: 0,
    salesOrderSubtotal: 0,
    salesOrderDeadProfit: 0,
    grandCount: 0,
    grandSubtotal: 0,
    grandDeadProfit: 0
  })

  // State for expanded rep row and popup modal
  const [expandedRepId, setExpandedRepId] = useState<string | null>(null)
  const [modalRep, setModalRep] = useState<any | null>(null)

  const [activeTab, setActiveTab] = useState<"invoices" | "salesOrders">("invoices")
  const [modalActiveTab, setModalActiveTab] = useState<"invoices" | "salesOrders">("invoices")
  const [searchQuery, setSearchQuery] = useState("")

  const fetchStats = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set("repId", selectedRepId)
      params.set("period", period)
      if (period === "custom") {
        if (startDate) params.set("startDate", startDate)
        if (endDate) params.set("endDate", endDate)
      }

      const res = await fetch(`/api/get-rep-stats?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        setReps(data.reps || [])
        if (data.totals) setTotals(data.totals)
      }
    } catch (e) {
      console.error("Failed to load rep stats", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isInitialized) return
    if (!currentUser) {
      router.push("/login")
      return
    }
    fetchStats()
  }, [isInitialized, currentUser, selectedRepId, period, startDate, endDate])

  // Extract selected rep or all reps documents
  const allInvoices = useMemo(() => {
    let list: any[] = []
    reps.forEach(r => {
      if (r.invoices && Array.isArray(r.invoices)) {
        list = list.concat(r.invoices.map((inv: any) => ({ ...inv, repName: r.repName })))
      }
    })
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      return list.filter(inv =>
        (inv.invoiceNumber || "").toLowerCase().includes(q) ||
        (inv.customerName || "").toLowerCase().includes(q) ||
        (inv.repName || "").toLowerCase().includes(q)
      )
    }
    return list
  }, [reps, searchQuery])

  const allSalesOrders = useMemo(() => {
    let list: any[] = []
    reps.forEach(r => {
      if (r.salesOrders && Array.isArray(r.salesOrders)) {
        list = list.concat(r.salesOrders.map((so: any) => ({ ...so, repName: r.repName })))
      }
    })
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      return list.filter(so =>
        (so.salesOrderNumber || "").toLowerCase().includes(q) ||
        (so.customerName || "").toLowerCase().includes(q) ||
        (so.repName || "").toLowerCase().includes(q)
      )
    }
    return list
  }, [reps, searchQuery])

  const toggleExpandRep = (repId: string) => {
    setExpandedRepId(prev => prev === repId ? null : repId)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-100 p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-900/60 p-6 rounded-2xl border border-white/10 backdrop-blur-md">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <FiBarChart2 className="text-orange-500" size={28} /> Admin Rep Performance & Financial Board
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Complete financial evaluation for sales orders and invoices by representative and date range.
          </p>
        </div>

        <button
          onClick={fetchStats}
          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold transition-all border border-neutral-700 flex items-center gap-2 self-start md:self-auto cursor-pointer"
        >
          <FiRefreshCw className={loading ? "animate-spin" : ""} size={14} /> Refresh Data
        </button>
      </div>

      {/* Controls: Rep Picker & Date Range Selector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-neutral-900/40 p-5 rounded-2xl border border-white/10">
        
        {/* Rep Selector */}
        <div className="lg:col-span-4 space-y-1.5">
          <label className="text-xs font-bold text-neutral-400 flex items-center gap-1.5">
            <FiUsers className="text-orange-400" /> Select Sales Representative
          </label>
          <select
            value={selectedRepId}
            onChange={e => setSelectedRepId(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            <option value="all">🌟 All Representatives (Company Aggregate)</option>
            {reps.map(r => (
              <option key={r.repId} value={r.repId}>
                {r.repName} ({r.role || "Sales"})
              </option>
            ))}
          </select>
        </div>

        {/* Period Selector */}
        <div className="lg:col-span-8 space-y-1.5">
          <label className="text-xs font-bold text-neutral-400 flex items-center gap-1.5">
            <FiCalendar className="text-orange-400" /> Date Range / Period
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "today", label: "Today" },
              { id: "this_week", label: "This Week" },
              { id: "this_month", label: "This Month (MTD)" },
              { id: "last_month", label: "Last Month" },
              { id: "this_year", label: "This Year (YTD)" },
              { id: "last_year", label: "Last Year" },
              { id: "custom", label: "Custom Range" }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  period === p.id
                    ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20"
                    : "bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          {period === "custom" && (
            <div className="flex gap-3 pt-2">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
              />
              <span className="text-neutral-500 self-center">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Invoices Subtotal */}
        <div className="bg-neutral-900/60 border border-white/10 p-5 rounded-2xl space-y-1">
          <div className="flex justify-between items-center text-xs font-bold text-neutral-400">
            <span>INVOICES SUBTOTAL</span>
            <FiFileText className="text-sky-400" size={16} />
          </div>
          <div className="text-2xl font-black text-white">{formatCurrency(totals.invoiceSubtotal || 0)}</div>
          <div className="text-[11px] text-neutral-500 flex justify-between">
            <span>{totals.invoiceCount || 0} Invoices</span>
            <span className="text-emerald-400 font-semibold">Vig: {formatCurrency(totals.invoiceDeadProfit || 0)}</span>
          </div>
        </div>

        {/* Sales Orders Subtotal */}
        <div className="bg-neutral-900/60 border border-white/10 p-5 rounded-2xl space-y-1">
          <div className="flex justify-between items-center text-xs font-bold text-neutral-400">
            <span>SALES ORDERS SUBTOTAL</span>
            <FiShoppingCart className="text-purple-400" size={16} />
          </div>
          <div className="text-2xl font-black text-white">{formatCurrency(totals.salesOrderSubtotal || 0)}</div>
          <div className="text-[11px] text-neutral-500 flex justify-between">
            <span>{totals.salesOrderCount || 0} Orders</span>
            <span className="text-purple-400 font-semibold">Vig: {formatCurrency(totals.salesOrderDeadProfit || 0)}</span>
          </div>
        </div>

        {/* Grand Total Revenue */}
        <div className="bg-gradient-to-br from-emerald-950/40 to-neutral-900 border border-emerald-500/30 p-5 rounded-2xl space-y-1">
          <div className="flex justify-between items-center text-xs font-bold text-emerald-400">
            <span>⚡ GRAND TOTAL REVENUE</span>
            <FiDollarSign className="text-emerald-400" size={18} />
          </div>
          <div className="text-2xl font-black text-emerald-300">{formatCurrency(totals.grandSubtotal || 0)}</div>
          <div className="text-[11px] text-neutral-400">
            Invoices ({formatCurrency(totals.invoiceSubtotal || 0)}) + Sales Orders ({formatCurrency(totals.salesOrderSubtotal || 0)})
          </div>
        </div>

        {/* Grand Total Dead Profit */}
        <div className="bg-gradient-to-br from-orange-950/40 to-neutral-900 border border-orange-500/30 p-5 rounded-2xl space-y-1">
          <div className="flex justify-between items-center text-xs font-bold text-orange-400">
            <span>⚡ GRAND TOTAL DEAD PROFIT</span>
            <FiBarChart2 className="text-orange-400" size={18} />
          </div>
          <div className="text-2xl font-black text-orange-300">{formatCurrency(totals.grandDeadProfit || 0)}</div>
          <div className="text-[11px] text-neutral-400">
            Invoices Dead Profit ({formatCurrency(totals.invoiceDeadProfit || 0)}) + Sales Orders ({formatCurrency(totals.salesOrderDeadProfit || 0)})
          </div>
        </div>
      </div>

      {/* Rep Summary Cards Table with Expanding Div & Breakdown Modal */}
      <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FiUsers className="text-orange-500" /> Representative Financial Breakdown (Click Row to Expand Breakdown)
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-neutral-400 uppercase text-[10px] tracking-wider bg-black/30">
                <th className="p-3">Representative</th>
                <th className="p-3 text-right">Invoices Qty</th>
                <th className="p-3 text-right">Invoices Subtotal</th>
                <th className="p-3 text-right">Invoices Dead Profit</th>
                <th className="p-3 text-right">Sales Orders Qty</th>
                <th className="p-3 text-right">Sales Orders Subtotal</th>
                <th className="p-3 text-right font-bold text-emerald-400">Grand Total Subtotal</th>
                <th className="p-3 text-center">Breakdown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {reps.map(r => {
                const soSubtotal = r.salesOrders?.reduce((s: number, o: any) => s + (o.subtotal || 0), 0) || 0
                const soDeadProfit = r.salesOrders?.reduce((s: number, o: any) => s + (o.deadProfit || 0), 0) || 0
                const grandSub = (r.revenue || 0) + soSubtotal
                const grandDead = (r.deadProfit || 0) + soDeadProfit
                const isExpanded = expandedRepId === r.repId

                return (
                  <React.Fragment key={r.repId}>
                    <tr
                      onClick={() => toggleExpandRep(r.repId)}
                      className="hover:bg-white/5 transition-colors cursor-pointer select-none"
                    >
                      <td className="p-3 font-bold text-white flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-[10px]">
                          {r.repName.charAt(0)}
                        </div>
                        {r.repName}
                      </td>
                      <td className="p-3 text-right font-mono text-neutral-400">{r.invoiceCount || 0}</td>
                      <td className="p-3 text-right font-mono font-semibold text-white">{formatCurrency(r.revenue || 0)}</td>
                      <td className="p-3 text-right font-mono font-semibold text-emerald-400">{formatCurrency(r.deadProfit || 0)}</td>
                      <td className="p-3 text-right font-mono text-neutral-400">{r.salesOrderCount || 0}</td>
                      <td className="p-3 text-right font-mono font-semibold text-purple-300">{formatCurrency(soSubtotal)}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatCurrency(grandSub)}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setModalRep(r)
                          }}
                          className="px-2.5 py-1 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-lg text-[10px] font-bold border border-orange-500/30 transition-all flex items-center gap-1 mx-auto cursor-pointer"
                        >
                          🔍 Breakdown Popup
                        </button>
                      </td>
                    </tr>

                    {/* EXPANDING BREAKDOWN DIV */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="p-4 bg-black/40 border-t border-b border-orange-500/20">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                              <h4 className="text-xs font-bold text-orange-400 uppercase tracking-wider flex items-center gap-2">
                                📊 Detailed Breakdown for {r.repName}
                              </h4>
                              <div className="flex gap-4 text-xs font-mono">
                                <span className="text-emerald-400 font-bold">Grand Subtotal: {formatCurrency(grandSub)}</span>
                                <span className="text-orange-400 font-bold">Grand Dead Profit: {formatCurrency(grandDead)}</span>
                              </div>
                            </div>

                            {/* Invoices List */}
                            <div className="space-y-2">
                              <h5 className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
                                📄 Invoices ({r.invoices?.length || 0})
                              </h5>
                              <div className="max-h-48 overflow-y-auto border border-white/10 rounded-xl bg-neutral-900/80">
                                <table className="w-full text-left text-[11px]">
                                  <thead className="bg-black/50 text-neutral-400 uppercase text-[9px]">
                                    <tr>
                                      <th className="p-2">Invoice #</th>
                                      <th className="p-2">Date</th>
                                      <th className="p-2">Customer Name</th>
                                      <th className="p-2 text-right">Subtotal</th>
                                      <th className="p-2 text-right">Dead Profit</th>
                                      <th className="p-2 text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/5">
                                    {(r.invoices || []).map((inv: any, idx: number) => (
                                      <tr key={inv.id || idx} className="hover:bg-white/5">
                                        <td className="p-2 font-mono font-bold text-sky-400">#{inv.invoiceNumber}</td>
                                        <td className="p-2 text-neutral-400">{formatDate(inv.date)}</td>
                                        <td className="p-2 font-semibold text-white">{inv.customerName}</td>
                                        <td className="p-2 text-right font-mono font-bold text-white">{formatCurrency(inv.subtotal)}</td>
                                        <td className="p-2 text-right font-mono font-bold text-emerald-400">{formatCurrency(inv.deadProfit)}</td>
                                        <td className="p-2 text-center text-[9px] font-bold text-emerald-400">{inv.status || "Paid"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Sales Orders List */}
                            <div className="space-y-2">
                              <h5 className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">
                                📦 Sales Orders ({r.salesOrders?.length || 0})
                              </h5>
                              <div className="max-h-48 overflow-y-auto border border-white/10 rounded-xl bg-neutral-900/80">
                                <table className="w-full text-left text-[11px]">
                                  <thead className="bg-black/50 text-neutral-400 uppercase text-[9px]">
                                    <tr>
                                      <th className="p-2">Sales Order #</th>
                                      <th className="p-2">Date</th>
                                      <th className="p-2">Customer Name</th>
                                      <th className="p-2 text-right">Subtotal</th>
                                      <th className="p-2 text-right">Dead Profit</th>
                                      <th className="p-2 text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/5">
                                    {(r.salesOrders || []).map((so: any, idx: number) => (
                                      <tr key={so.id || idx} className="hover:bg-white/5">
                                        <td className="p-2 font-mono font-bold text-purple-400">#{so.salesOrderNumber}</td>
                                        <td className="p-2 text-neutral-400">{formatDate(so.date)}</td>
                                        <td className="p-2 font-semibold text-white">{so.customerName}</td>
                                        <td className="p-2 text-right font-mono font-bold text-white">{formatCurrency(so.subtotal)}</td>
                                        <td className="p-2 text-right font-mono font-bold text-purple-300">{formatCurrency(so.deadProfit)}</td>
                                        <td className="p-2 text-center text-[9px] font-bold text-purple-300">{so.status || "Confirmed"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* POPUP BREAKDOWN MODAL */}
      {modalRep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-full max-w-3xl space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  📊 Rep Financial Totals Popup: <span className="text-orange-400">{modalRep.repName}</span>
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Complete list of invoice and sales order numbers for the selected date range.
                </p>
              </div>
              <button onClick={() => setModalRep(null)} className="p-1 text-neutral-400 hover:text-white cursor-pointer text-lg font-bold">
                ✕
              </button>
            </div>

            {/* Totals Summary Cards inside Popup */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <div className="bg-black/50 p-3 rounded-xl border border-white/10 text-xs">
                <span className="text-neutral-400 font-bold block text-[10px]">INVOICES SUBTOTAL</span>
                <span className="text-sm font-black text-white">{formatCurrency(modalRep.revenue || 0)}</span>
                <span className="text-[10px] text-neutral-500 block">{modalRep.invoiceCount || 0} Invoices</span>
              </div>

              <div className="bg-black/50 p-3 rounded-xl border border-white/10 text-xs">
                <span className="text-neutral-400 font-bold block text-[10px]">INVOICES VIG</span>
                <span className="text-sm font-black text-emerald-400">{formatCurrency(modalRep.deadProfit || 0)}</span>
              </div>

              <div className="bg-black/50 p-3 rounded-xl border border-white/10 text-xs">
                <span className="text-neutral-400 font-bold block text-[10px]">SALES ORDERS SUBTOTAL</span>
                <span className="text-sm font-black text-purple-300">
                  {formatCurrency(modalRep.salesOrders?.reduce((s: number, o: any) => s + (o.subtotal || 0), 0) || 0)}
                </span>
                <span className="text-[10px] text-neutral-500 block">{modalRep.salesOrderCount || 0} Orders</span>
              </div>

              <div className="bg-black/50 p-3 rounded-xl border border-white/10 text-xs">
                <span className="text-neutral-400 font-bold block text-[10px]">SALES ORDERS VIG</span>
                <span className="text-sm font-black text-purple-400">
                  {formatCurrency(modalRep.salesOrders?.reduce((s: number, o: any) => s + (o.deadProfit || 0), 0) || 0)}
                </span>
              </div>
            </div>

            {/* Tabs inside Popup */}
            <div className="flex gap-2 border-b border-white/10 pb-2 shrink-0">
              <button
                onClick={() => setModalActiveTab("invoices")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  modalActiveTab === "invoices" ? "bg-sky-500 text-white" : "bg-neutral-800 text-neutral-400"
                }`}
              >
                📄 Invoices ({modalRep.invoices?.length || 0})
              </button>
              <button
                onClick={() => setModalActiveTab("salesOrders")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  modalActiveTab === "salesOrders" ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400"
                }`}
              >
                📦 Sales Orders ({modalRep.salesOrders?.length || 0})
              </button>
            </div>

            {/* Datapoints Table inside Popup */}
            <div className="flex-1 overflow-y-auto border border-white/10 rounded-xl bg-black/40">
              {modalActiveTab === "invoices" ? (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-neutral-900 text-neutral-400 uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="p-2.5">Invoice #</th>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Customer Name</th>
                      <th className="p-2.5 text-right">Subtotal</th>
                      <th className="p-2.5 text-right">Dead Profit</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(modalRep.invoices || []).map((inv: any, idx: number) => (
                      <tr key={inv.id || idx} className="hover:bg-white/5">
                        <td className="p-2.5 font-mono font-bold text-sky-400">#{inv.invoiceNumber}</td>
                        <td className="p-2.5 text-neutral-400">{formatDate(inv.date)}</td>
                        <td className="p-2.5 font-semibold text-white">{inv.customerName}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-white">{formatCurrency(inv.subtotal)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-400">{formatCurrency(inv.deadProfit)}</td>
                        <td className="p-2.5 text-center text-[10px] font-bold text-emerald-400">{inv.status || "Paid"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-neutral-900 text-neutral-400 uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="p-2.5">Sales Order #</th>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Customer Name</th>
                      <th className="p-2.5 text-right">Subtotal</th>
                      <th className="p-2.5 text-right">Dead Profit</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(modalRep.salesOrders || []).map((so: any, idx: number) => (
                      <tr key={so.id || idx} className="hover:bg-white/5">
                        <td className="p-2.5 font-mono font-bold text-purple-400">#{so.salesOrderNumber}</td>
                        <td className="p-2.5 text-neutral-400">{formatDate(so.date)}</td>
                        <td className="p-2.5 font-semibold text-white">{so.customerName}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-white">{formatCurrency(so.subtotal)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-purple-300">{formatCurrency(so.deadProfit)}</td>
                        <td className="p-2.5 text-center text-[10px] font-bold text-purple-300">{so.status || "Confirmed"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10 shrink-0">
              <button
                onClick={() => setModalRep(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Document Datapoints Table (Invoices & Sales Orders across reps) */}
      <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("invoices")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "invoices"
                  ? "bg-sky-500 text-white shadow-md"
                  : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              📄 All Invoices ({allInvoices.length})
            </button>
            <button
              onClick={() => setActiveTab("salesOrders")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "salesOrders"
                  ? "bg-purple-600 text-white shadow-md"
                  : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              📦 All Sales Orders ({allSalesOrders.length})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <FiSearch className="absolute left-3 top-2.5 text-neutral-500" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search document # or customer..."
              className="w-full bg-black/50 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          {activeTab === "invoices" ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-neutral-400 uppercase text-[10px] tracking-wider bg-black/30">
                  <th className="p-3">Invoice #</th>
                  <th className="p-3">Issue Date</th>
                  <th className="p-3">Customer Account</th>
                  <th className="p-3">Salesperson</th>
                  <th className="p-3 text-right">Subtotal</th>
                  <th className="p-3 text-right">Dead Profit</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {allInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-neutral-500">
                      No invoice datapoints found for the selected range.
                    </td>
                  </tr>
                ) : (
                  allInvoices.map((inv, idx) => (
                    <tr key={inv.id || idx} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 font-mono font-bold text-sky-400">#{inv.invoiceNumber}</td>
                      <td className="p-3 text-neutral-400">{formatDate(inv.date)}</td>
                      <td className="p-3 font-semibold text-white">{inv.customerName}</td>
                      <td className="p-3 text-neutral-300">{inv.repName}</td>
                      <td className="p-3 text-right font-mono font-bold text-white">{formatCurrency(inv.subtotal || 0)}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatCurrency(inv.deadProfit || 0)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.status === "Paid" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}>
                          {inv.status || "Paid"}
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
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {allSalesOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-neutral-500">
                      No sales order datapoints found for the selected range.
                    </td>
                  </tr>
                ) : (
                  allSalesOrders.map((so, idx) => (
                    <tr key={so.id || idx} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 font-mono font-bold text-purple-400">#{so.salesOrderNumber}</td>
                      <td className="p-3 text-neutral-400">{formatDate(so.date)}</td>
                      <td className="p-3 font-semibold text-white">{so.customerName}</td>
                      <td className="p-3 text-neutral-300">{so.repName}</td>
                      <td className="p-3 text-right font-mono font-bold text-white">{formatCurrency(so.subtotal || 0)}</td>
                      <td className="p-3 text-right font-mono font-bold text-purple-300">{formatCurrency(so.deadProfit || 0)}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {so.status || "Confirmed"}
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
  )
}
