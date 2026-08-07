"use client"

import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { useEffect, useState, useMemo } from "react"
import { FiDollarSign, FiChevronLeft, FiPlus, FiX, FiUpload, FiDownload, FiEdit2, FiTrash2, FiCheckCircle, FiList, FiClock, FiActivity } from "react-icons/fi"

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
  if (lines.length < 2) return [];

  const parseLine = (line: string) => {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i+1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]).map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    rows.push(row);
  }
  
  return rows;
}

function formatCurrency(value: number): string {
  return `$${(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "N/A"
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return dateStr
  }
}

interface RepLedger {
  repId: string
  repName: string
  totalEarned: number
  totalPaid: number
  balance: number
  totalFutures: number
  totalAtRisk: number
  invoices: any[]
  payouts: any[]
}

export default function PayoutsPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ledger, setLedger] = useState<RepLedger[]>([])
  const [sortField, setSortField] = useState<keyof RepLedger>("balance")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedYear, setSelectedYear] = useState<string>("all")
  const [availableYears, setAvailableYears] = useState<number[]>([])
  
  // Modal & View Mode State
  const [showModal, setShowModal] = useState(false)
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [selectedRepForLedger, setSelectedRepForLedger] = useState<RepLedger | null>(null)
  const [ledgerViewMode, setLedgerViewMode] = useState<"timeline" | "table">("timeline")
  const [timelineFilter, setTimelineFilter] = useState<"all" | "commissions" | "payouts">("all")
  const [csvUploadStatus, setCsvUploadStatus] = useState<string | null>(null)
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  
  // Edit Payout State
  const [editingPayout, setEditingPayout] = useState<any | null>(null)
  const [editAmount, setEditAmount] = useState("")
  const [editMethod, setEditMethod] = useState("Check")
  const [editNotes, setEditNotes] = useState("")
  const [editDate, setEditDate] = useState("")

  const [selectedRepId, setSelectedRepId] = useState("")
  const [payoutAmount, setPayoutAmount] = useState("")
  const [payoutMethod, setPayoutMethod] = useState("Check")
  const [payoutNotes, setPayoutNotes] = useState("")
  const [payoutDate, setPayoutDate] = useState(new Date().toISOString().split('T')[0])
  const [submitting, setSubmitting] = useState(false)

  const normalizedRole = currentUser?.role?.toLowerCase() || ""
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("manager")

  const fetchLedger = async () => {
    try {
      setError(null)
      setLoading(true)
      const res = await fetch(`/api/get-commissions?includeHidden=true&year=${selectedYear}`)
      const data = await res.json()
      if (data.success) {
        const repsArray = Object.values(data.byRep) as RepLedger[]
        repsArray.sort((a, b) => b.balance - a.balance)
        setLedger(repsArray)
        if (data.years && data.years.length > 0) {
          setAvailableYears(data.years)
        }
        if (selectedRepForLedger) {
          const updatedRep = repsArray.find(r => r.repId === selectedRepForLedger.repId)
          if (updatedRep) setSelectedRepForLedger(updatedRep)
        }
      } else {
        setError(data.error || "Failed to load ledger")
      }
    } catch (err: any) {
      setError(err.message || "Network error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLedger()
  }, [selectedYear])

  const handleSort = (field: keyof RepLedger) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const processedLedger = useMemo(() => {
    let filtered = ledger
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(r => r.repName.toLowerCase().includes(q))
    }
    return filtered.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      aVal = (aVal as number) || 0
      bVal = (bVal as number) || 0
      return sortDir === "asc" ? aVal - bVal : bVal - aVal
    })
  }, [ledger, sortField, sortDir, searchQuery])

  const transactionLedger = useMemo(() => {
    if (!selectedRepForLedger) return []
    
    type Transaction = {
      id: string
      rawPayoutId?: string
      date: string
      type: "commission" | "payout"
      description: string
      amount: number
      rawPayout?: any
    }
    
    const txs: Transaction[] = []
    
    // Add all commissions (NO date cutoffs or artificial limits)
    for (const inv of (selectedRepForLedger.invoices || [])) {
      if (inv.commission && inv.commission.total > 0) {
        txs.push({
          id: `inv-${inv.id}`,
          date: inv.issueDate,
          type: "commission",
          description: inv.name || `Invoice ${inv.invoiceNumber}`,
          amount: inv.commission.total
        })
      }
    }
    
    // Add all payouts (NO limits)
    for (const payout of (selectedRepForLedger.payouts || [])) {
      txs.push({
        id: `pay-${payout.id}`,
        rawPayoutId: payout.id,
        date: payout.date || payout.createdAt,
        type: "payout",
        description: `Payout (${payout.method})${payout.notes ? ` - ${payout.notes}` : ''}`,
        amount: -payout.amount,
        rawPayout: payout
      })
    }
    
    // Sort chronologically ascending
    txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    // Calculate running balance
    let runningBalance = 0
    return txs.map(tx => {
      runningBalance += tx.amount
      return { ...tx, runningBalance }
    })
  }, [selectedRepForLedger])

  const handleAddPayout = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRepId || !payoutAmount) return

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/add-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repId: selectedRepId,
          amount: payoutAmount,
          method: payoutMethod,
          notes: payoutNotes,
          date: payoutDate
        })
      })
      const data = await res.json()
      if (data.success) {
        setShowModal(false)
        setPayoutAmount("")
        setPayoutNotes("")
        setPayoutDate(new Date().toISOString().split('T')[0])
        setPayoutMethod("Check")
        fetchLedger()
      } else {
        setError(data.error || "Failed to add payout")
      }
    } catch (err: any) {
      setError(err.message || "Network error")
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenEditPayout = (payout: any) => {
    setEditingPayout(payout)
    setEditAmount((payout.amount || 0).toString())
    setEditMethod(payout.method || "Check")
    setEditNotes(payout.notes || "")
    const d = payout.date ? new Date(payout.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    setEditDate(d)
  }

  const handleSaveEditPayout = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPayout || !editAmount) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/update-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutId: editingPayout.id,
          amount: parseFloat(editAmount),
          method: editMethod,
          notes: editNotes,
          date: editDate
        })
      })
      const data = await res.json()
      if (data.success) {
        setEditingPayout(null)
        fetchLedger()
      } else {
        alert("Failed to update payout: " + (data.error || "Unknown error"))
      }
    } catch (err: any) {
      alert("Error updating payout: " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeletePayout = async (payoutId: string) => {
    if (!window.confirm("⚠️ Are you sure you want to delete this payout? This will recalculate the representative's balance.")) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/delete-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId })
      })
      const data = await res.json()
      if (data.success) {
        fetchLedger()
      } else {
        alert("Failed to delete payout: " + (data.error || "Unknown error"))
      }
    } catch (err: any) {
      alert("Error deleting payout: " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const downloadExampleCsv = () => {
    const csvContent = "data:text/csv;charset=utf-8,Rep Name,Amount,Method,Payout Date,Notes\nRichard Griffin,500.00,Check,2026-08-01,Monthly Commission\nRoss Haisler,1250.50,Zelle,2026-08-01,Advance Payout";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "payouts_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-100 p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-neutral-900/60 p-6 rounded-2xl border border-white/10 backdrop-blur-md">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <FiDollarSign className="text-emerald-500" size={28} /> Commission Ledger & Payout Manager
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Track representative balances, view invoices, edit payouts, and view full historical commission timelines.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={downloadExampleCsv}
            className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition-all border border-neutral-700 flex items-center gap-2 cursor-pointer"
          >
            <FiDownload size={14} /> Template
          </button>
          <button
            onClick={() => setShowCsvModal(true)}
            className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition-all border border-neutral-700 flex items-center gap-2 cursor-pointer"
          >
            <FiUpload size={14} /> Import CSV
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20 cursor-pointer"
            >
              <FiPlus size={16} /> New Payout
            </button>
          )}
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by rep name..."
              className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <span>Year / Range:</span>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer font-bold"
            >
              <option value="all">🌟 All Time (Beginning of Time)</option>
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-neutral-400 uppercase text-[10px] tracking-wider bg-black/30">
                <th className="p-3 cursor-pointer" onClick={() => handleSort("repName")}>REP NAME</th>
                <th className="p-3 text-right cursor-pointer" onClick={() => handleSort("totalEarned")}>TOTAL EARNED</th>
                <th className="p-3 text-right cursor-pointer" onClick={() => handleSort("totalPaid")}>TOTAL PAID</th>
                <th className="p-3 text-right cursor-pointer font-bold text-purple-400" onClick={() => handleSort("balance")}>BALANCE</th>
                <th className="p-3 text-right">FUTURES</th>
                <th className="p-3 text-right text-red-400">AT RISK (90D+)</th>
                <th className="p-3 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {processedLedger.map(r => (
                <tr
                  key={r.repId}
                  onClick={() => setSelectedRepForLedger(r)}
                  className="hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <td className="p-3 font-bold text-white flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">
                      {r.repName.charAt(0)}
                    </div>
                    <div>
                      <div>{r.repName}</div>
                      <div className="text-[10px] text-neutral-500 font-normal">{r.payouts?.length || 0} Payouts</div>
                    </div>
                  </td>
                  <td className="p-3 text-right font-mono font-semibold text-emerald-400">{formatCurrency(r.totalEarned)}</td>
                  <td className="p-3 text-right font-mono text-neutral-300">{formatCurrency(r.totalPaid)}</td>
                  <td className="p-3 text-right font-mono font-black text-purple-300 text-sm">{formatCurrency(r.balance)}</td>
                  <td className="p-3 text-right font-mono text-neutral-400">{formatCurrency(r.totalFutures)}</td>
                  <td className="p-3 text-right font-mono text-red-400">{formatCurrency(r.totalAtRisk)}</td>
                  <td className="p-3 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedRepForLedger(r)
                      }}
                      className="px-3 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-lg text-[10px] font-bold border border-purple-500/30 transition-all cursor-pointer flex items-center gap-1.5 mx-auto"
                    >
                      <FiClock size={12} /> View Timeline & Payouts
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW PAYOUT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FiPlus className="text-emerald-400" /> Record New Commission Payout
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 text-neutral-400 hover:text-white cursor-pointer text-lg font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddPayout} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-1">Representative</label>
                <select
                  required
                  value={selectedRepId}
                  onChange={e => setSelectedRepId(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Select Rep...</option>
                  {ledger.map(r => (
                    <option key={r.repId} value={r.repId}>{r.repName} (Balance: {formatCurrency(r.balance)})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-400 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={payoutAmount}
                    onChange={e => setPayoutAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 mb-1">Payout Date</label>
                  <input
                    type="date"
                    required
                    value={payoutDate}
                    onChange={e => setPayoutDate(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-1">Payment Method</label>
                <select
                  value={payoutMethod}
                  onChange={e => setPayoutMethod(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Check">Check</option>
                  <option value="Zelle">Zelle</option>
                  <option value="Direct Deposit">Direct Deposit</option>
                  <option value="Wire Transfer">Wire Transfer</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-1">Notes / Reference #</label>
                <textarea
                  value={payoutNotes}
                  onChange={e => setPayoutNotes(e.target.value)}
                  placeholder="Check # or transaction reference..."
                  rows={2}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold cursor-pointer shadow-lg shadow-emerald-900/20"
                >
                  {submitting ? "Saving..." : "Save Payout"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PAYOUT MODAL — z-[60] so it appears above the z-50 timeline modal */}
      {editingPayout && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FiEdit2 className="text-purple-400" /> Edit Recorded Payout
              </h3>
              <button onClick={() => setEditingPayout(null)} className="p-1 text-neutral-400 hover:text-white cursor-pointer text-lg font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditPayout} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-400 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 mb-1">Payout Date</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-1">Payment Method</label>
                <select
                  value={editMethod}
                  onChange={e => setEditMethod(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="Check">Check</option>
                  <option value="Zelle">Zelle</option>
                  <option value="Direct Deposit">Direct Deposit</option>
                  <option value="Wire Transfer">Wire Transfer</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 mb-1">Notes / Description</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPayout(null)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold cursor-pointer shadow-lg shadow-purple-900/20"
                >
                  {submitting ? "Saving..." : "Update Payout"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRANSACTION LEDGER & CHRONOLOGICAL TIMELINE LIST MODAL */}
      {selectedRepForLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex flex-col p-5 border-b border-white/10 shrink-0 gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <FiClock className="text-purple-400" /> Chronological Timeline & Payouts Ledger
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Showing complete history for <span className="font-bold text-purple-400">{selectedRepForLedger.repName}</span> from the beginning of time.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* View Mode Toggle */}
                  <div className="flex bg-black/50 border border-white/10 p-1 rounded-xl">
                    <button
                      onClick={() => setLedgerViewMode("timeline")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        ledgerViewMode === "timeline" ? "bg-purple-600 text-white shadow-md" : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      <FiActivity size={13} /> Timeline List
                    </button>
                    <button
                      onClick={() => setLedgerViewMode("table")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        ledgerViewMode === "table" ? "bg-purple-600 text-white shadow-md" : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      <FiList size={13} /> Table View
                    </button>
                  </div>

                  <button 
                    onClick={() => setSelectedRepForLedger(null)}
                    className="p-1.5 text-neutral-400 hover:text-white bg-neutral-800 rounded-xl transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Filter Chips */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Show:</span>
                {([
                  { key: "all", label: `All (${transactionLedger.length})`, color: "neutral" },
                  { key: "commissions", label: `💰 Commissions (${transactionLedger.filter(t => t.type === 'commission').length})`, color: "emerald" },
                  { key: "payouts", label: `💸 Payouts (${transactionLedger.filter(t => t.type === 'payout').length})`, color: "purple" },
                ] as { key: "all" | "commissions" | "payouts"; label: string; color: string }[]).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setTimelineFilter(f.key)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer border ${
                      timelineFilter === f.key
                        ? f.color === 'emerald' ? 'bg-emerald-600/30 border-emerald-500/60 text-emerald-300'
                          : f.color === 'purple' ? 'bg-purple-600/30 border-purple-500/60 text-purple-300'
                          : 'bg-white/10 border-white/30 text-white'
                        : 'bg-transparent border-white/10 text-neutral-500 hover:text-neutral-300 hover:border-white/20'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="overflow-y-auto flex-1 p-5">
              {(() => {
                const filteredLedger = transactionLedger.filter(tx =>
                  timelineFilter === 'all' ? true
                  : timelineFilter === 'commissions' ? tx.type === 'commission'
                  : tx.type === 'payout'
                )
                return ledgerViewMode === "timeline" ? (
                /* SPLIT TIMELINE — commissions LEFT, payouts RIGHT */
                <div className="relative">
                  {/* Center spine — only show when viewing all */}
                  {timelineFilter === 'all' && <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/15 to-transparent pointer-events-none" />}

                  {/* Legend — only when showing all */}
                  {timelineFilter === 'all' && (
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-5 px-2">
                      <span className="text-emerald-500/70">💰 Commissions Earned</span>
                      <span className="text-purple-500/70">Payouts Recorded 💸</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    {filteredLedger.map((tx, i) => {
                      const isCommission = tx.type === 'commission'
                      return (
                        <div key={`${tx.id}-${i}`} className="relative flex items-center gap-0">

                          {/* LEFT SIDE — Commission card */}
                          <div className="w-[calc(50%-20px)] flex justify-end">
                            {isCommission ? (
                              <div className="bg-black/40 hover:bg-emerald-950/30 border border-emerald-500/20 hover:border-emerald-500/40 p-3 rounded-xl transition-all w-full max-w-sm group/card">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400/70">Commission</span>
                                  <span className="text-[9px] font-mono text-neutral-500">{formatDate(tx.date)}</span>
                                </div>
                                <div className="text-xs font-bold text-white leading-snug mb-2 truncate" title={tx.description}>{tx.description}</div>
                                <div className="flex items-end justify-between">
                                  <div className="text-[10px] font-mono text-neutral-500">
                                    Bal: <span className="text-purple-300/80 font-bold">{formatCurrency(tx.runningBalance)}</span>
                                  </div>
                                  <div className="text-sm font-mono font-black text-emerald-400">+{formatCurrency(tx.amount)}</div>
                                </div>
                              </div>
                            ) : <div className="w-full" />}
                          </div>

                          {/* Center dot */}
                          <div className="w-10 flex items-center justify-center shrink-0 z-10">
                            <div className={`w-3 h-3 rounded-full border-2 border-neutral-900 shadow-lg ${
                              isCommission
                                ? 'bg-emerald-400 shadow-emerald-500/30'
                                : 'bg-purple-400 shadow-purple-500/30'
                            }`} />
                          </div>

                          {/* RIGHT SIDE — Payout card */}
                          <div className="w-[calc(50%-20px)] flex justify-start">
                            {!isCommission ? (
                              <div className="bg-black/40 hover:bg-purple-950/30 border border-purple-500/20 hover:border-purple-500/40 p-3 rounded-xl transition-all w-full max-w-sm group/card">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-purple-400/70">Payout</span>
                                  <span className="text-[9px] font-mono text-neutral-500">{formatDate(tx.date)}</span>
                                </div>
                                <div className="text-xs font-bold text-white leading-snug mb-2 truncate" title={tx.description}>{tx.description}</div>
                                <div className="flex items-end justify-between">
                                  <div className="text-[10px] font-mono text-neutral-500">
                                    Bal: <span className="text-purple-300/80 font-bold">{formatCurrency(tx.runningBalance)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm font-mono font-black text-purple-300">{formatCurrency(tx.amount)}</div>
                                    {tx.rawPayout && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleOpenEditPayout(tx.rawPayout) }}
                                          title="Edit Payout"
                                          className="p-1 bg-neutral-800 hover:bg-neutral-700 text-purple-300 rounded-md border border-purple-500/30 cursor-pointer transition-all"
                                        >
                                          <FiEdit2 size={11} />
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleDeletePayout(tx.rawPayoutId!) }}
                                          title="Delete Payout"
                                          className="p-1 bg-neutral-800 hover:bg-red-950 text-red-400 rounded-md border border-red-500/30 cursor-pointer transition-all"
                                        >
                                          <FiTrash2 size={11} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : <div className="w-full" />}
                          </div>

                        </div>
                      )
                    })}
                  </div>

                  {filteredLedger.length === 0 && (
                    <div className="p-8 text-center text-neutral-500 italic">
                      {timelineFilter === 'all'
                        ? 'No historical commission or payout timeline records found.'
                        : `No ${timelineFilter} found for this rep.`}
                    </div>
                  )}
                </div>
              ) : (
                /* TABLE VIEW */
                <div className="bg-black/30 border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-neutral-800/60 text-neutral-400 uppercase text-[10px] tracking-wider">
                        <th className="p-3">Date</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Description / Notes</th>
                        <th className="p-3 text-right">Amount</th>
                        <th className="p-3 text-right text-purple-400">Running Balance</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredLedger.map((tx, i) => (
                        <tr key={`${tx.id}-${i}`} className="hover:bg-white/5 transition-colors">
                          <td className="p-3 font-mono text-neutral-400">{formatDate(tx.date)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              tx.type === 'commission' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            }`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-white max-w-xs truncate" title={tx.description}>
                            {tx.description}
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${tx.amount > 0 ? 'text-emerald-400' : 'text-purple-300'}`}>
                            {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-purple-300 bg-purple-950/20">
                            {formatCurrency(tx.runningBalance)}
                          </td>
                          <td className="p-3 text-center">
                            {tx.type === 'payout' && tx.rawPayout && (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleOpenEditPayout(tx.rawPayout) }}
                                  title="Edit Payout"
                                  className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-purple-300 rounded-lg text-xs font-bold border border-purple-500/30 cursor-pointer"
                                >
                                  <FiEdit2 size={12} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeletePayout(tx.rawPayoutId!) }}
                                  title="Delete Payout"
                                  className="p-1.5 bg-neutral-800 hover:bg-red-950 text-red-400 rounded-lg text-xs font-bold border border-red-500/30 cursor-pointer"
                                >
                                  <FiTrash2 size={12} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )
              })()}
            </div>
            
            <div className="p-4 border-t border-white/10 bg-black/40 shrink-0 flex justify-between items-center">
              <div className="text-xs text-neutral-400">Total Paid: <span className="text-white font-bold">{formatCurrency(selectedRepForLedger.totalPaid)}</span></div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-neutral-400 uppercase">Current Balance:</span>
                <span className="text-xl font-black text-purple-400 font-mono">{formatCurrency(selectedRepForLedger.balance)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {showCsvModal && (
        <CsvImportModal
          onClose={() => { setShowCsvModal(false); setCsvUploadStatus(null); setCsvErrors([]) }}
          ledger={ledger}
          onSuccess={() => { setShowCsvModal(false); setCsvUploadStatus(null); setCsvErrors([]); fetchLedger() }}
        />
      )}

    </div>
  )
}

// ── CSV Import Modal Component ────────────────────────────────────────────────
interface CsvImportModalProps {
  onClose: () => void
  ledger: RepLedger[]
  onSuccess: () => void
}

function CsvImportModal({ onClose, ledger, onSuccess }: CsvImportModalProps) {
  const [preview, setPreview] = useState<{ row: Record<string, string>; repId: string | null; repName: string; matched: boolean }[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  // Fuzzy rep name match: normalize and find closest
  function matchRep(csvName: string): { repId: string | null; repName: string; matched: boolean } {
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
    const target = norm(csvName)
    // Exact match first
    const exact = ledger.find(r => norm(r.repName) === target)
    if (exact) return { repId: exact.repId, repName: exact.repName, matched: true }
    // Contains match
    const contains = ledger.find(r => norm(r.repName).includes(target) || target.includes(norm(r.repName)))
    if (contains) return { repId: contains.repId, repName: contains.repName, matched: true }
    return { repId: null, repName: csvName, matched: false }
  }

  function parseAndPreview(text: string) {
    const parsed = parseCSV(text)
    if (parsed.length === 0) { setStatus('No rows found in CSV.'); return }
    const previewed = parsed.map(row => {
      const csvName = row['rep name'] || row['rep'] || row['name'] || row['representative'] || ''
      const match = matchRep(csvName)
      return { row, ...match }
    })
    setPreview(previewed)
    setStatus(null)
    setErrors([])
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => parseAndPreview((e.target?.result as string) || '')
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleImport = async () => {
    const validRows = preview.filter(p => p.matched)
    if (validRows.length === 0) { setStatus('No rows with matched reps to import.'); return }

    setImporting(true)
    setErrors([])
    const errs: string[] = []
    let success = 0

    for (const p of validRows) {
      const amount = parseFloat(p.row['amount'] || p.row['payout amount'] || '0')
      const date = p.row['payout date'] || p.row['date'] || new Date().toISOString().split('T')[0]
      const method = p.row['method'] || p.row['payment method'] || 'Check'
      const notes = p.row['notes'] || p.row['description'] || p.row['reference'] || ''

      if (!amount || isNaN(amount) || amount <= 0) {
        errs.push(`Row for "${p.repName}": Invalid amount "${p.row['amount']}"`)
        continue
      }

      try {
        const res = await fetch('/api/add-payout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repId: p.repId, amount, date, method, notes }),
        })
        const data = await res.json()
        if (data.success) { success++ }
        else { errs.push(`Row for "${p.repName}": ${data.error || 'API error'}`) }
      } catch (e: any) {
        errs.push(`Row for "${p.repName}": Network error - ${e.message}`)
      }
    }

    setImporting(false)
    setErrors(errs)
    setStatus(`✅ Imported ${success} of ${validRows.length} payouts.${errs.length > 0 ? ` ${errs.length} failed.` : ''}`)
    if (success > 0 && errs.length === 0) setTimeout(onSuccess, 800)
  }

  const unmatchedCount = preview.filter(p => !p.matched).length

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 shrink-0">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FiUpload className="text-blue-400" /> Bulk Import Payouts via CSV
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">Required columns: <span className="text-white font-mono">Rep Name, Amount, Method, Payout Date, Notes</span></p>
          </div>
          <button onClick={onClose} className="p-1.5 text-neutral-400 hover:text-white cursor-pointer text-lg font-bold">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Drop Zone */}
          {preview.length === 0 && (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-all ${
                isDragOver ? 'border-blue-500 bg-blue-500/10' : 'border-white/20 hover:border-white/40'
              }`}
            >
              <FiUpload size={32} className="mx-auto mb-3 text-neutral-500" />
              <p className="text-sm font-bold text-white mb-1">Drag & drop your CSV here</p>
              <p className="text-xs text-neutral-400 mb-4">or click to browse</p>
              <label className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-all">
                Choose File
                <input type="file" accept=".csv" onChange={handleFileInput} className="hidden" />
              </label>
            </div>
          )}

          {/* Preview Table */}
          {preview.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-neutral-400">
                  <span className="text-white font-bold">{preview.length} rows</span> parsed —
                  <span className="text-emerald-400 font-bold"> {preview.length - unmatchedCount} matched</span>,
                  <span className="text-red-400 font-bold"> {unmatchedCount} unmatched</span>
                </p>
                <label className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-bold cursor-pointer border border-neutral-700">
                  Change File <input type="file" accept=".csv" onChange={handleFileInput} className="hidden" />
                </label>
              </div>

              <div className="rounded-xl overflow-hidden border border-white/10">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-neutral-800 text-neutral-400 uppercase text-[10px] tracking-wider">
                      <th className="p-2 text-left">Match</th>
                      <th className="p-2 text-left">CSV Name → Matched Rep</th>
                      <th className="p-2 text-right">Amount</th>
                      <th className="p-2 text-left">Method</th>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {preview.map((p, i) => (
                      <tr key={i} className={`${p.matched ? 'bg-black/20' : 'bg-red-950/20'} hover:bg-white/5 transition-colors`}>
                        <td className="p-2">
                          {p.matched
                            ? <FiCheckCircle className="text-emerald-400" size={13} />
                            : <span className="text-red-400 font-bold text-[10px]">NO MATCH</span>
                          }
                        </td>
                        <td className="p-2">
                          <div className="text-neutral-400 text-[10px]">{p.row['rep name'] || p.row['rep'] || p.row['name'] || '—'}</div>
                          {p.matched && <div className="text-white font-bold">{p.repName}</div>}
                        </td>
                        <td className="p-2 text-right font-mono text-emerald-400 font-bold">
                          ${parseFloat(p.row['amount'] || '0').toFixed(2)}
                        </td>
                        <td className="p-2 text-neutral-300">{p.row['method'] || p.row['payment method'] || 'Check'}</td>
                        <td className="p-2 font-mono text-neutral-400">{p.row['payout date'] || p.row['date'] || '—'}</td>
                        <td className="p-2 text-neutral-400 max-w-[120px] truncate" title={p.row['notes']}>{p.row['notes'] || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {unmatchedCount > 0 && (
                <p className="text-xs text-red-400 bg-red-950/30 border border-red-500/30 rounded-xl p-3">
                  ⚠️ {unmatchedCount} row(s) have unrecognized rep names and will be skipped. Check spelling against the ledger.
                </p>
              )}
            </div>
          )}

          {/* Status & Errors */}
          {status && (
            <p className={`text-xs font-bold p-3 rounded-xl border ${
              status.includes('✅') ? 'text-emerald-400 bg-emerald-950/30 border-emerald-500/30' : 'text-red-400 bg-red-950/30 border-red-500/30'
            }`}>{status}</p>
          )}
          {errors.length > 0 && (
            <div className="space-y-1">
              {errors.map((e, i) => <p key={i} className="text-xs text-red-400 bg-red-950/20 p-2 rounded-lg">{e}</p>)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black/40 shrink-0 flex justify-between items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing || preview.filter(p => p.matched).length === 0}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold cursor-pointer shadow-lg shadow-blue-900/20 flex items-center gap-2"
          >
            {importing ? (
              <><span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full" /> Importing...</>
            ) : (
              <><FiCheckCircle size={13} /> Import {preview.filter(p => p.matched).length} Payouts</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
