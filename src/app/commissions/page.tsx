"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { PayPeriodStatementModal } from "@/components/PayPeriodStatementModal"
import { 
  FiDollarSign, FiPercent, FiTrendingUp, FiAward, FiUser, 
  FiCheckCircle, FiClock, FiFileText, FiRefreshCw, FiAlertCircle 
} from "react-icons/fi"

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0)
}

function fmtDate(s: string | null) {
  if (!s) return "--"
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function CommissionsPage() {
  const { zohoContext: user } = useZoho()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [byRep, setByRep] = useState<Record<string, any>>({})
  const [selectedRepId, setSelectedRepId] = useState<string>("")
  const [selectedYear, setSelectedYear] = useState<string>("all")
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [showStatement, setShowStatement] = useState(false)
  const [activeTab, setActiveTab] = useState<"invoices" | "payouts">("invoices")

  const normalizedRole = (user?.role || "").toLowerCase()
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("manager")

  const fetchCommissions = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/get-commissions?includeHidden=true&year=${selectedYear}`)
      const data = await res.json()
      if (data.success) {
        setByRep(data.byRep || {})
        if (data.years && data.years.length > 0) setAvailableYears(data.years)
        
        const repsList = Object.keys(data.byRep || {})
        if (repsList.length > 0) {
          // If logged in rep matches one in byRep, pick them; else pick first rep
          const userEmail = (user?.email || "").toLowerCase()
          const matchedRep = repsList.find(r => r.toLowerCase().includes(userEmail.split('@')[0])) || repsList[0]
          if (!selectedRepId) setSelectedRepId(matchedRep)
        }
      } else {
        setError(data.error || "Failed to load commission data")
      }
    } catch (err: any) {
      setError(err.message || "Network error loading commissions")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCommissions()
  }, [selectedYear])

  const repOptions = useMemo(() => {
    return Object.values(byRep).map((r: any) => ({ id: r.repId, name: r.repName }))
  }, [byRep])

  const currentRepData = useMemo(() => {
    if (!selectedRepId || !byRep[selectedRepId]) {
      const first = Object.values(byRep)[0] as any
      return first || null
    }
    return byRep[selectedRepId]
  }, [byRep, selectedRepId])

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] flex items-center gap-2">
            <FiDollarSign className="text-emerald-500" /> Sales Commissions & VIG Payroll Statements
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Track net profit split earnings, VIG deductions, running draw balances, and pay period statements.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && repOptions.length > 0 && (
            <div className="flex items-center gap-2 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-1.5 shadow-sm">
              <FiUser className="text-neutral-400 text-xs" />
              <select
                value={selectedRepId}
                onChange={(e) => setSelectedRepId(e.target.value)}
                className="bg-transparent text-sm font-semibold text-[var(--foreground)] focus:outline-none cursor-pointer"
              >
                {repOptions.map((r) => (
                  <option key={r.id} value={r.id} className="bg-[var(--card)] text-[var(--foreground)]">
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {availableYears.length > 0 && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-[var(--card)] border border-[var(--border)] text-sm font-medium text-[var(--foreground)] rounded-lg px-3 py-1.5 shadow-sm focus:outline-none"
            >
              <option value="all">All Time</option>
              {availableYears.map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => fetchCommissions()}
            className="p-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-neutral-800 transition"
            title="Refresh Data"
          >
            <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {currentRepData && (
            <button
              onClick={() => setShowStatement(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 flex items-center gap-2 shadow-sm"
            >
              <FiAward className="h-4 w-4" />
              View Pay Statement
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <FiRefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
          <span className="ml-3 text-sm text-[var(--muted-foreground)]">Loading commission records...</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-3">
          <FiAlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && currentRepData && (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Total Earned</span>
                <FiDollarSign className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="mt-3 text-2xl font-bold text-emerald-400">{fmt(currentRepData.totalEarned)}</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Net 50% split after VIG markup</p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Total Paid Out</span>
                <FiCheckCircle className="h-5 w-5 text-indigo-400" />
              </div>
              <div className="mt-3 text-2xl font-bold text-[var(--foreground)]">{fmt(currentRepData.totalPaid)}</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Disbursed checks & draws</p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Unpaid Balance</span>
                <FiClock className="h-5 w-5 text-amber-400" />
              </div>
              <div className={`mt-3 text-2xl font-bold ${currentRepData.balance >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                {fmt(currentRepData.balance)}
              </div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {currentRepData.balance >= 0 ? 'Pending payout' : 'Draw balance advance'}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Total Net Profit</span>
                <FiTrendingUp className="h-5 w-5 text-sky-400" />
              </div>
              <div className="mt-3 text-2xl font-bold text-[var(--foreground)]">{fmt(currentRepData.totalProfit)}</div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Generated across {currentRepData.invoices?.length || 0} deals</p>
            </div>
          </div>

          {/* Breakdown Tabs */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
            <div className="flex border-b border-[var(--border)] bg-[var(--card)] px-4">
              <button
                onClick={() => setActiveTab("invoices")}
                className={`py-3 px-4 font-semibold text-sm border-b-2 transition ${
                  activeTab === "invoices"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                Invoices & Deals ({currentRepData.invoices?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("payouts")}
                className={`py-3 px-4 font-semibold text-sm border-b-2 transition ${
                  activeTab === "payouts"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                Payout History ({currentRepData.payouts?.length || 0})
              </button>
            </div>

            {/* Invoices Table */}
            {activeTab === "invoices" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-900/50 text-xs uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Account / Customer</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-right">Profit</th>
                      <th className="py-3 px-4 text-right">Est. Commission</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {(currentRepData.invoices || []).map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-neutral-800/40 transition">
                        <td className="py-3 px-4 whitespace-nowrap text-[var(--muted-foreground)]">
                          {fmtDate(inv.issueDate)}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-indigo-400">
                          {inv.invoiceNumber || inv.zohoId || "--"}
                        </td>
                        <td className="py-3 px-4 font-medium text-[var(--foreground)]">
                          {inv.accountName || inv.name || "Customer"}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-[var(--foreground)]">
                          {fmt(inv.amount)}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-sky-400">
                          {fmt(inv.profit)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-400">
                          {fmt(inv.commission?.total || (inv.profit * 0.5))}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            inv.isPaid || inv.status === 'paid'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {inv.isPaid || inv.status === 'paid' ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {(!currentRepData.invoices || currentRepData.invoices.length === 0) && (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-[var(--muted-foreground)]">
                          No invoice records found for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payouts Table */}
            {activeTab === "payouts" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-900/50 text-xs uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Method / Check #</th>
                      <th className="py-3 px-4">Notes</th>
                      <th className="py-3 px-4 text-right">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {(currentRepData.payouts || []).map((p: any) => (
                      <tr key={p.id} className="hover:bg-neutral-800/40 transition">
                        <td className="py-3 px-4 whitespace-nowrap text-[var(--muted-foreground)]">
                          {fmtDate(p.date || p.createdAt)}
                        </td>
                        <td className="py-3 px-4 font-medium text-[var(--foreground)]">
                          {p.method || 'Check'}
                        </td>
                        <td className="py-3 px-4 text-[var(--muted-foreground)]">
                          {p.notes || '--'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-indigo-400">
                          {fmt(p.amount)}
                        </td>
                      </tr>
                    ))}
                    {(!currentRepData.payouts || currentRepData.payouts.length === 0) && (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-[var(--muted-foreground)]">
                          No payout transactions logged yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Pay Period Statement Modal */}
      {showStatement && currentRepData && (
        <PayPeriodStatementModal
          rep={currentRepData}
          onClose={() => setShowStatement(false)}
        />
      )}
    </div>
  )
}
