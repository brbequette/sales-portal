"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import {
  FiFileText, FiTruck, FiDollarSign, FiAlertCircle, FiGift,
  FiCheckCircle, FiXCircle, FiChevronRight, FiClock, FiRefreshCw,
  FiExternalLink, FiArrowRight
} from "react-icons/fi"

// ─── Pipeline Stage Definitions ───
const STAGES = [
  { key: "estimate", label: "Estimate", icon: FiFileText, color: "#38bdf8", bg: "rgba(56,189,248,0.08)", borderColor: "rgba(56,189,248,0.2)" },
  { key: "salesorder", label: "Sales Order", icon: FiFileText, color: "#a855f7", bg: "rgba(168,85,247,0.08)", borderColor: "rgba(168,85,247,0.2)" },
  { key: "invoiced", label: "Invoiced", icon: FiDollarSign, color: "#f97316", bg: "rgba(249,115,22,0.08)", borderColor: "rgba(249,115,22,0.2)" },
  { key: "partially_paid", label: "Partial Pay", icon: FiDollarSign, color: "#f59e0b", bg: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.2)" },
  { key: "overdue", label: "Overdue", icon: FiAlertCircle, color: "#ef4444", bg: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)" },
  { key: "paid", label: "Paid", icon: FiCheckCircle, color: "#10b981", bg: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.2)" },
  { key: "needs_gift", label: "Send Gift", icon: FiGift, color: "#ec4899", bg: "rgba(236,72,153,0.08)", borderColor: "rgba(236,72,153,0.2)" },
  { key: "complete", label: "Complete", icon: FiCheckCircle, color: "#22d3ee", bg: "rgba(34,211,238,0.08)", borderColor: "rgba(34,211,238,0.2)" },
] as const

interface PipelineDeal {
  id: string
  customer: string
  invoiceNumber: string
  amount: number
  profit: number
  date: string
  daysInStage: number
  stage: string
  rep: string
  balance: number
}

// ─── Deal Card ───
function DealCard({ deal, onView }: { deal: PipelineDeal; onView: (deal: PipelineDeal) => void }) {
  const isStale = deal.daysInStage > 14
  const isUrgent = deal.daysInStage > 30

  return (
    <div
      onClick={() => onView(deal)}
      className={`group relative p-3 rounded-xl border cursor-pointer transition-all duration-200 hover:translate-y-[-2px] hover:shadow-lg ${
        isUrgent ? "border-red-500/30 bg-red-500/[0.04]" :
        isStale ? "border-amber-500/20 bg-amber-500/[0.03]" :
        "border-white/[0.06] bg-white/[0.02]"
      } hover:border-white/[0.15]`}
    >
      {/* Stale indicator */}
      {isStale && (
        <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
          isUrgent ? "bg-red-500 pulse-live" : "bg-amber-500"
        }`} />
      )}

      <p className="text-xs font-bold text-white truncate pr-4">{deal.customer}</p>
      <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">{deal.invoiceNumber}</p>

      <div className="flex items-center justify-between mt-2">
        <span className="text-sm font-black text-white">${deal.amount.toLocaleString()}</span>
        <span className="text-[10px] text-neutral-500 flex items-center gap-1">
          <FiClock size={9} /> {deal.daysInStage}d
        </span>
      </div>

      {deal.profit > 0 && (
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[10px] text-emerald-400/70">Profit: ${deal.profit.toLocaleString()}</span>
          <span className="text-[10px] text-neutral-600 truncate max-w-[80px]">{deal.rep}</span>
        </div>
      )}

      {/* Hover action */}
      <div className="absolute inset-0 rounded-xl bg-white/[0.02] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <span className="text-[10px] font-semibold text-white/60 bg-black/40 px-2 py-0.5 rounded-lg backdrop-blur-sm">
          Click to view
        </span>
      </div>
    </div>
  )
}

// ─── Pipeline Column ───
function PipelineColumn({ stage, deals, onViewDeal }: {
  stage: typeof STAGES[number]; deals: PipelineDeal[]; onViewDeal: (deal: PipelineDeal) => void
}) {
  const totalValue = deals.reduce((sum, d) => sum + d.amount, 0)
  const Icon = stage.icon

  return (
    <div className="flex flex-col min-w-[200px] max-w-[240px] shrink-0">
      {/* Column Header */}
      <div className="rounded-xl p-3 mb-2 border" style={{ background: stage.bg, borderColor: stage.borderColor }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon size={14} style={{ color: stage.color }} />
            <span className="text-xs font-bold text-white">{stage.label}</span>
          </div>
          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md"
            style={{ background: `${stage.color}20`, color: stage.color }}>
            {deals.length}
          </span>
        </div>
        <p className="text-[10px] text-neutral-500 mt-1">${totalValue.toLocaleString()}</p>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto max-h-[60vh] scrollbar-none pr-1">
        {deals.length === 0 ? (
          <div className="text-center py-6 text-neutral-600 text-xs">No deals</div>
        ) : (
          deals.map(deal => (
            <DealCard key={deal.id} deal={deal} onView={onViewDeal} />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main Pipeline Component ───
export function DealPipeline({ onViewInvoice }: { onViewInvoice?: (invoice: any) => void }) {
  const [deals, setDeals] = useState<PipelineDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [repFilter, setRepFilter] = useState("All")
  const [reps, setReps] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchPipelineData()
    const interval = setInterval(fetchPipelineData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  async function fetchPipelineData() {
    try {
      const res = await fetch("/api/zoho-invoices")
      const json = await res.json()
      if (!json.invoices) return

      const now = new Date()
      const pipelineDeals: PipelineDeal[] = []
      const repSet = new Set<string>()

      for (const inv of json.invoices) {
        const rep = inv.salesorder_salesperson_name || inv.salesperson_name || "Unknown"
        const repUpper = rep.toUpperCase()
        if (repUpper.includes("PAUL") && (repUpper.includes("GENCUSKI") || repUpper.includes("GENKUSKI"))) continue

        repSet.add(rep)

        const amount = parseFloat(inv.sub_total || inv.total || "0")
        const profit = parseFloat(inv.cf_profit_unformatted || inv.cf_estimated_profit_unformatted || "0")
        const balance = parseFloat(inv.balance || "0")
        const dateStr = inv.salesorder_date || inv.date || ""
        const invDate = new Date(dateStr)
        const daysOld = Math.max(0, Math.floor((now.getTime() - invDate.getTime()) / 86400000))
        const status = (inv.status || "").toLowerCase()
        const docType = inv.entity_type || ""

        // Determine stage from status and document type
        let stage = "invoiced"
        if (docType === "estimate" || status === "draft") {
          stage = "estimate"
        } else if (docType === "salesorder" || status === "open" || status === "draft") {
          if (inv.salesorder_id || docType === "salesorder") stage = "salesorder"
        }
        
        if (status === "overdue" || (inv.due_date && new Date(inv.due_date) < now && balance > 0 && status !== "paid" && status !== "void" && status !== "draft")) {
          stage = "overdue"
        } else if (status === "partially_paid") {
          stage = "partially_paid"
        } else if (status === "paid") {
          // Check if recent (within 14 days) — needs gift
          if (daysOld <= 14) {
            stage = "needs_gift"
          } else {
            stage = "complete"
          }
        } else if (status === "sent") {
          stage = "invoiced"
        }

        // Skip void/deleted
        if (status === "void" || status === "deleted") continue

        pipelineDeals.push({
          id: inv.invoice_id || inv.salesorder_id || inv.estimate_id || String(Math.random()),
          customer: inv.customer_name || "Unknown",
          invoiceNumber: inv.invoice_number || inv.salesorder_number || inv.estimate_number || "—",
          amount,
          profit,
          date: dateStr,
          daysInStage: daysOld,
          stage,
          rep,
          balance,
        })
      }

      setDeals(pipelineDeals)
      setReps(Array.from(repSet).sort())
    } catch (err) {
      console.error("Pipeline fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleViewDeal = (deal: PipelineDeal) => {
    if (onViewInvoice) {
      onViewInvoice({ id: deal.id, zohoId: deal.id, invoice_number: deal.invoiceNumber, customer_name: deal.customer })
    }
  }

  const filteredDeals = repFilter === "All" ? deals : deals.filter(d => d.rep === repFilter)

  // Summary stats
  const totalValue = filteredDeals.reduce((sum, d) => sum + d.amount, 0)
  const overdueDeals = filteredDeals.filter(d => d.stage === "overdue")
  const overdueValue = overdueDeals.reduce((sum, d) => sum + d.balance, 0)
  const staleCount = filteredDeals.filter(d => d.daysInStage > 14 && !["paid", "complete", "needs_gift"].includes(d.stage)).length

  if (loading) {
    return (
      <div className="space-y-3 animate-fade-in">
        <div className="skeleton h-12 rounded-xl" />
        <div className="flex gap-3 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-96 min-w-[200px] rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {/* ─── Pipeline Header ─── */}
      <div className="glass-panel rounded-xl p-3 border border-white/[0.06] flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div>
            <p className="text-xs text-neutral-500 font-medium">Total Pipeline</p>
            <p className="text-lg font-black text-white">${totalValue.toLocaleString()}</p>
          </div>
          <div className="w-px h-8 bg-white/[0.06]" />
          <div>
            <p className="text-xs text-neutral-500 font-medium">Deals</p>
            <p className="text-lg font-black text-white">{filteredDeals.length}</p>
          </div>
          {overdueDeals.length > 0 && (
            <>
              <div className="w-px h-8 bg-white/[0.06]" />
              <div>
                <p className="text-xs text-red-400/70 font-medium">Overdue</p>
                <p className="text-lg font-black text-red-400">{overdueDeals.length} (${overdueValue.toLocaleString()})</p>
              </div>
            </>
          )}
          {staleCount > 0 && (
            <>
              <div className="w-px h-8 bg-white/[0.06]" />
              <div className="flex items-center gap-1.5 text-xs text-amber-400">
                <FiAlertCircle size={12} />
                <span>{staleCount} stale ({">"}14 days)</span>
              </div>
            </>
          )}
        </div>

        {/* Rep Filter */}
        <select
          value={repFilter}
          onChange={e => setRepFilter(e.target.value)}
          className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--primary)]"
        >
          <option value="All">All Reps</option>
          {reps.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <button onClick={() => { setLoading(true); fetchPipelineData() }}
          className="p-2 rounded-lg bg-white/[0.04] border border-white/10 hover:border-white/20 text-neutral-400 hover:text-white transition-all">
          <FiRefreshCw size={14} />
        </button>
      </div>

      {/* ─── Kanban Board ─── */}
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-4 scrollbar-none">
        {STAGES.map(stage => (
          <PipelineColumn
            key={stage.key}
            stage={stage}
            deals={filteredDeals.filter(d => d.stage === stage.key).sort((a, b) => b.amount - a.amount)}
            onViewDeal={handleViewDeal}
          />
        ))}
      </div>
    </div>
  )
}
