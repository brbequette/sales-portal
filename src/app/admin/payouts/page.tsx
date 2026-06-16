"use client"

import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { useEffect, useState, useMemo } from "react"
import { FiDollarSign, FiChevronLeft, FiPlus, FiX } from "react-icons/fi"

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface RepLedger {
  repId: string
  repName: string
  totalEarned: number
  totalPaid: number
  balance: number
  totalFutures: number
  totalAtRisk: number
  payouts: any[]
}

export default function PayoutsPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ledger, setLedger] = useState<RepLedger[]>([])
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [selectedRepId, setSelectedRepId] = useState("")
  const [payoutAmount, setPayoutAmount] = useState("")
  const [payoutMethod, setPayoutMethod] = useState("Check")
  const [payoutNotes, setPayoutNotes] = useState("")
  const [payoutCaughtUp, setPayoutCaughtUp] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const normalizedRole = currentUser?.role?.toLowerCase() || ""
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("manager")

  const fetchLedger = async () => {
    try {
      setError(null)
      const res = await fetch("/api/get-commissions?includeHidden=true")
      const data = await res.json()
      if (data.success) {
        const repsArray = Object.values(data.byRep) as RepLedger[]
        // Sort by balance descending
        repsArray.sort((a, b) => b.balance - a.balance)
        setLedger(repsArray)
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
    if (!isInitialized) return
    if (!currentUser) {
      router.push("/login")
      return
    }
    if (!isAdmin) {
      router.push("/")
      return
    }
    fetchLedger()
  }, [isInitialized, currentUser, router, isAdmin])

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
          caughtUpTo: payoutCaughtUp
        })
      })
      const data = await res.json()
      if (data.success) {
        setShowModal(false)
        setPayoutAmount("")
        setPayoutNotes("")
        setPayoutCaughtUp("")
        setPayoutMethod("Check")
        // Refresh the ledger
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/admin")}
              className="p-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl transition-colors"
            >
              <FiChevronLeft size={20} className="text-neutral-400" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-purple-400 to-emerald-400 bg-clip-text text-transparent">
                Payouts & Ledger
              </h1>
              <p className="text-sm text-neutral-400 font-medium mt-1">
                Manage sales rep balances, payouts, and commissions.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-900/20"
          >
            <FiPlus size={16} />
            <span>Add Payout</span>
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Ledger Table */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-neutral-950/50 border-b border-neutral-800 text-neutral-400 uppercase tracking-wider text-xs">
                  <th className="px-6 py-4 font-bold">Rep Name</th>
                  <th className="px-6 py-4 font-bold text-right text-emerald-400">Total Earned</th>
                  <th className="px-6 py-4 font-bold text-right text-neutral-500">Total Paid</th>
                  <th className="px-6 py-4 font-bold text-right text-purple-400 text-base">Balance</th>
                  <th className="px-6 py-4 font-bold text-right text-amber-500">Futures</th>
                  <th className="px-6 py-4 font-bold text-right text-red-400">At Risk (90d+)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {ledger.map((rep) => (
                  <tr key={rep.repId} className="hover:bg-neutral-800/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white">{rep.repName}</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">{rep.payouts?.length || 0} Payouts</div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-emerald-300">
                      {formatCurrency(rep.totalEarned)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-neutral-400">
                      {formatCurrency(rep.totalPaid)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-base font-bold text-purple-300 bg-purple-900/10">
                      {formatCurrency(rep.balance)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-amber-300">
                      {formatCurrency(rep.totalFutures || 0)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-red-400">
                      {formatCurrency(rep.totalAtRisk || 0)}
                    </td>
                  </tr>
                ))}
                {ledger.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-neutral-500 italic">
                      No reps found with commission data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Add Payout Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-neutral-800">
              <h2 className="text-xl font-black text-white">Add Payout</h2>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 text-neutral-400 hover:text-white bg-neutral-800/50 hover:bg-neutral-700 rounded-xl transition-colors"
              >
                <FiX size={20} />
              </button>
            </div>
            <form onSubmit={handleAddPayout} className="p-4 sm:p-6 space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Sales Rep</label>
                <select
                  required
                  value={selectedRepId}
                  onChange={(e) => setSelectedRepId(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  <option value="">-- Select Rep --</option>
                  {ledger.map(r => (
                    <option key={r.repId} value={r.repId}>
                      {r.repName} (Balance: {formatCurrency(r.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-bold">$</span>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-8 pr-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Method</label>
                  <select
                    required
                    value={payoutMethod}
                    onChange={(e) => setPayoutMethod(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                  >
                    <option value="Check">Check</option>
                    <option value="Zelle">Zelle</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Caught up to...</label>
                <input
                  type="text"
                  value={payoutCaughtUp}
                  onChange={(e) => setPayoutCaughtUp(e.target.value)}
                  placeholder="e.g. Invoice #1234 or Dec 15th"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
                <p className="text-[10px] text-neutral-500 mt-1">Note how far down the invoice line this gets them caught up with.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Description / Notes</label>
                <textarea
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  placeholder="Optional notes about this payout"
                  rows={2}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors resize-none"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-sm font-bold text-neutral-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedRepId || !payoutAmount}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/20"
                >
                  {submitting ? "Saving..." : "Add Payout"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  )
}
