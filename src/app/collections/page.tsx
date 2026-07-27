"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { 
  FiDollarSign, FiPhoneCall, FiClock, FiAlertCircle, FiSearch, 
  FiRefreshCw, FiUser, FiCreditCard, FiTruck, FiFileText, FiFilter
} from "react-icons/fi"
import { CollectionsModal, Invoice } from "@/components/CollectionsModal"
import { toast } from "react-hot-toast"

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0)
}

export default function CollectionsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedRep, setSelectedRep] = useState<string>("all")
  
  // Modal state
  const [activeModal, setActiveModal] = useState<{
    mode: 'call' | 'card' | 'return' | 'campaign' | null;
    invoice: Invoice | null;
  }>({ mode: null, invoice: null })

  const fetchCollections = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/get-collections")
      const data = await res.json()
      if (data.success && Array.isArray(data.invoices)) {
        setInvoices(data.invoices)
      } else {
        toast.error(data.error || "Failed to load collections")
      }
    } catch (e: any) {
      console.error("Collections fetch error:", e)
      toast.error("Failed to connect to collections service")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCollections()
  }, [fetchCollections])

  // Extract unique sales reps for filter dropdown
  const salesReps = useMemo(() => {
    const set = new Set<string>()
    invoices.forEach(inv => {
      if (inv.salesperson_name) set.add(inv.salesperson_name)
    })
    return Array.from(set).sort()
  }, [invoices])

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchesSearch = 
        !search ||
        inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
        inv.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        inv.salesperson_name?.toLowerCase().includes(search.toLowerCase())
      
      const matchesRep = 
        selectedRep === "all" || 
        inv.salesperson_name === selectedRep

      return matchesSearch && matchesRep
    })
  }, [invoices, search, selectedRep])

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalBalance = filteredInvoices.reduce((sum, i) => sum + (i.balance || 0), 0)
    const over90Balance = filteredInvoices
      .filter(i => (i.days_overdue || 0) >= 90)
      .reduce((sum, i) => sum + (i.balance || 0), 0)
    
    return {
      count: filteredInvoices.length,
      totalBalance,
      over90Balance,
      avgOverdue: filteredInvoices.length > 0 
        ? Math.round(filteredInvoices.reduce((sum, i) => sum + (i.days_overdue || 0), 0) / filteredInvoices.length)
        : 0
    }
  }, [filteredInvoices])

  return (
    <div className="min-h-full p-4 md:p-6 space-y-6">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <FiPhoneCall className="text-red-400" /> Collections & Aging Command Center
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Track overdue invoices, log collection calls, run payments, and manage payment arrangements.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchCollections}
            disabled={loading}
            className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-neutral-300 hover:text-white hover:bg-white/10 transition"
            title="Refresh Data"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={16} />
          </button>
          
          <button
            onClick={() => setActiveModal({ mode: 'campaign', invoice: null })}
            disabled={filteredInvoices.length === 0}
            className="rounded-xl bg-gradient-to-r from-red-600 to-amber-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-900/30 hover:opacity-95 transition disabled:opacity-50 flex items-center gap-2"
          >
            <FiPhoneCall size={16} /> Open Call Campaign ({filteredInvoices.length})
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-bold uppercase tracking-wider">
            <span>Total Overdue</span>
            <FiDollarSign className="text-red-400" size={16} />
          </div>
          <div className="text-2xl font-black text-white">{fmt(metrics.totalBalance)}</div>
          <div className="text-xs text-neutral-500">{metrics.count} invoices pending</div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-bold uppercase tracking-wider">
            <span>90+ Days Overdue</span>
            <FiAlertCircle className="text-amber-400" size={16} />
          </div>
          <div className="text-2xl font-black text-amber-400">{fmt(metrics.over90Balance)}</div>
          <div className="text-xs text-neutral-500">Critical attention required</div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-bold uppercase tracking-wider">
            <span>Avg Overdue Days</span>
            <FiClock className="text-blue-400" size={16} />
          </div>
          <div className="text-2xl font-black text-white">{metrics.avgOverdue} Days</div>
          <div className="text-xs text-neutral-500">Across all open accounts</div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-bold uppercase tracking-wider">
            <span>Open Accounts</span>
            <FiUser className="text-emerald-400" size={16} />
          </div>
          <div className="text-2xl font-black text-white">{metrics.count}</div>
          <div className="text-xs text-neutral-500">Active collection targets</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glass-panel p-4 rounded-2xl border border-white/10 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by invoice #, customer name, or rep..."
            className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <FiFilter className="text-neutral-400" size={16} />
          <select
            value={selectedRep}
            onChange={e => setSelectedRep(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
          >
            <option value="all">All Sales Representatives</option>
            {salesReps.map(rep => (
              <option key={rep} value={rep}>{rep}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Overdue Invoices Table */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        {loading ? (
          <div className="p-12 text-center text-neutral-400 space-y-3">
            <FiRefreshCw className="animate-spin mx-auto text-red-500" size={28} />
            <p className="text-sm">Loading collections and overdue invoice records...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 space-y-3">
            <FiAlertCircle className="mx-auto text-neutral-600" size={32} />
            <p className="text-base font-semibold text-neutral-300">No overdue invoices found</p>
            <p className="text-xs text-neutral-500">All accounts are currently up to date or match your search criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 border-b border-white/10 text-xs font-bold uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="py-3.5 px-4">Invoice #</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Sales Rep</th>
                  <th className="py-3.5 px-4">Due Date</th>
                  <th className="py-3.5 px-4">Days Overdue</th>
                  <th className="py-3.5 px-4 text-right">Balance</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredInvoices.map(inv => {
                  const days = inv.days_overdue || 0
                  const isSevere = days >= 90

                  return (
                    <tr key={inv.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        #{inv.invoice_number}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-neutral-200">
                        {inv.customer_name}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-400 text-xs">
                        {inv.salesperson_name || "Unassigned"}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-400 text-xs">
                        {inv.due_date || "--"}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
                          isSevere 
                            ? "bg-red-950/60 text-red-400 border-red-800/50" 
                            : days >= 30 
                            ? "bg-amber-950/60 text-amber-400 border-amber-800/50"
                            : "bg-blue-950/60 text-blue-400 border-blue-800/50"
                        }`}>
                          {days} Days
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-red-400">
                        {fmt(inv.balance)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setActiveModal({ mode: 'call', invoice: inv })}
                            className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white transition text-xs font-bold flex items-center gap-1"
                            title="Log Call"
                          >
                            <FiPhoneCall size={14} /> Log Call
                          </button>

                          <button
                            onClick={() => setActiveModal({ mode: 'card', invoice: inv })}
                            className="p-2 rounded-lg bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white transition text-xs font-bold flex items-center gap-1"
                            title="Run Credit Card"
                          >
                            <FiCreditCard size={14} /> Run Card
                          </button>

                          <button
                            onClick={() => setActiveModal({ mode: 'return', invoice: inv })}
                            className="p-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition text-xs font-bold flex items-center gap-1"
                            title="Generate Return Tag"
                          >
                            <FiTruck size={14} /> Return
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Unified Collections Modal */}
      {activeModal.mode && (
        <CollectionsModal
          isOpen={true}
          mode={activeModal.mode}
          invoice={activeModal.invoice}
          campaignInvoices={filteredInvoices}
          onClose={() => setActiveModal({ mode: null, invoice: null })}
          onSuccess={() => {
            fetchCollections()
            setActiveModal({ mode: null, invoice: null })
          }}
        />
      )}

    </div>
  )
}
