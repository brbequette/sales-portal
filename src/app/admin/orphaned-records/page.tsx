"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  FiAlertTriangle,
  FiRefreshCw,
  FiCheckCircle,
  FiLink,
  FiPackage,
  FiDollarSign,
  FiSearch,
  FiArchive,
  FiArrowRight,
  FiCalendar,
  FiCheck
} from "react-icons/fi"

interface PurchaseOrder {
  id: string
  zohoId: string
  vendorName: string | null
  date: string | null
  total: number
  status: string | null
  salesOrderNumber: string | null
  isDropshipment: boolean
}

interface Payment {
  id: string
  zohoId: string
  amount: number
  date: string | null
  mode: string | null
  status: string | null
  referenceNumber: string | null
  invoiceNumber: string | null
  customerName?: string | null
}

export default function OrphanedRecordsPage() {
  const [activeTab, setActiveTab] = useState<"pos" | "payments">("pos")
  const [pos, setPOs] = useState<PurchaseOrder[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState("")

  // Link Form State
  const [linkingRecordId, setLinkingRecordId] = useState<string | null>(null)
  const [linkingType, setLinkingType] = useState<"po" | "payment" | null>(null)
  const [invoiceInput, setInvoiceInput] = useState("")
  const [linkError, setLinkError] = useState("")
  const [linkSuccess, setLinkSuccess] = useState("")
  const [isLinking, setIsLinking] = useState(false)

  // Smart Matching States
  const [suggestions, setSuggestions] = useState<Record<string, any>>({})
  const [autoMatching, setAutoMatching] = useState(false)

  const fetchSuggestions = async () => {
    try {
      const res = await fetch("/api/admin/orphans/suggest-matches")
      const data = await res.json()
      if (data.success && data.suggestions) {
        setSuggestions(data.suggestions)
      }
    } catch (e) {
      console.error("Error fetching match suggestions:", e)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/orphans")
      const data = await res.json()
      if (data.success) {
        setPOs(data.purchaseOrders)
        setPayments(data.payments)
        fetchSuggestions()
      }
    } catch (e) {
      console.error("Error fetching orphans:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAutoMatch = async () => {
    setAutoMatching(true)
    setSyncMessage("Scanning unassociated POs against Invoices for high-confidence matches...")
    try {
      const res = await fetch("/api/admin/orphans/auto-match", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setSyncMessage(`Auto-match complete! ${data.message}`)
        fetchData()
        setTimeout(() => setSyncMessage(""), 6000)
      } else {
        setSyncMessage(`Auto-match failed: ${data.error || "Unknown error"}`)
      }
    } catch (e: any) {
      setSyncMessage(`Auto-match error: ${e.message}`)
    } finally {
      setAutoMatching(false)
    }
  }

  const handleQuickLink = async (poZohoId: string, invoiceNumber: string) => {
    setIsLinking(true)
    try {
      const res = await fetch("/api/admin/orphans/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "po",
          id: poZohoId,
          invoiceNumber
        })
      })
      const data = await res.json()
      if (data.success) {
        setLinkSuccess(data.message)
        fetchData()
        setTimeout(() => setLinkSuccess(""), 4000)
      }
    } catch (e) {
      console.error("Quick link failed", e)
    } finally {
      setIsLinking(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncMessage("Syncing POs and payments from Zoho...")
    try {
      const res = await fetch("/api/admin/books/sync-packages", { method: "POST" })
      const data = await res.json()
      if (data.success || data.packages) {
        setSyncMessage(`Sync complete! ${data.message || ''}`)
        fetchData()
        setTimeout(() => setSyncMessage(""), 5000)
      } else {
        setSyncMessage(`Sync failed: ${data.error || "Unknown error"}`)
      }
    } catch (e: any) {
      setSyncMessage(`Sync failed: ${e.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invoiceInput.trim() || !linkingRecordId || !linkingType) return
    setIsLinking(true)
    setLinkError("")
    setLinkSuccess("")
    try {
      const res = await fetch("/api/admin/orphans/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: linkingType,
          id: linkingRecordId,
          invoiceNumber: invoiceInput.trim()
        })
      })
      const data = await res.json()
      if (data.success) {
        setLinkSuccess(data.message)
        setInvoiceInput("")
        setTimeout(() => {
          setLinkingRecordId(null)
          setLinkingType(null)
          setLinkSuccess("")
          fetchData()
        }, 2000)
      } else {
        setLinkError(data.error || "Failed to link record")
      }
    } catch (err: any) {
      setLinkError(err.message)
    } finally {
      setIsLinking(false)
    }
  }

  const handleMarkInventory = async (poId: string) => {
    if (!confirm("Are you sure you want to mark this Purchase Order as an Inventory Order? It will be removed from the orphaned list.")) return
    try {
      const res = await fetch("/api/admin/orphans/mark-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: poId })
      })
      const data = await res.json()
      if (data.success) {
        fetchData()
      } else {
        alert(data.error || "Failed to mark as inventory order")
      }
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <div className="page-content">
      {/* ─── Header ─────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center">
            <FiPackage className="text-red-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Orphaned Files Manager</h1>
            <p className="page-subtitle">Link unassociated Purchase Orders and Payments to customer Invoices</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoMatch}
            disabled={autoMatching}
            className="td-btn td-btn-primary td-btn-sm disabled:opacity-50"
          >
            <FiCheck size={13} className={autoMatching ? "animate-spin" : ""} />
            {autoMatching ? "Matching..." : "Auto-Link High Confidence"}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="td-btn td-btn-ghost td-btn-sm disabled:opacity-50"
          >
            <FiRefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync POs &amp; Payments"}
          </button>
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div className="page-body animate-fade-in space-y-6">

        {/* Sync Progress Banner */}
        {syncMessage && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-blue-300 flex items-center gap-3 animate-pulse">
            <FiRefreshCw className="animate-spin text-xl flex-shrink-0" />
            <span>{syncMessage}</span>
          </div>
        )}

        {/* Summary Status Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 flex items-center gap-5">
            <div className="p-4 bg-red-500/10 text-red-400 rounded-xl">
              <FiPackage className="text-2xl" />
            </div>
            <div>
              <div className="text-sm text-slate-400 font-medium">Orphaned POs</div>
              <div className="text-3xl font-bold text-white mt-0.5">{pos.length}</div>
            </div>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 flex items-center gap-5">
            <div className="p-4 bg-amber-500/10 text-amber-400 rounded-xl">
              <FiDollarSign className="text-2xl" />
            </div>
            <div>
              <div className="text-sm text-slate-400 font-medium">Orphaned Payments</div>
              <div className="text-3xl font-bold text-white mt-0.5">{payments.length}</div>
            </div>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="border-b border-slate-800 flex gap-6">
          <button
            onClick={() => { setActiveTab("pos"); setLinkingRecordId(null); }}
            className={`pb-4 text-lg font-semibold transition ${
              activeTab === "pos"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Unassociated POs ({pos.length})
          </button>
          <button
            onClick={() => { setActiveTab("payments"); setLinkingRecordId(null); }}
            className={`pb-4 text-lg font-semibold transition ${
              activeTab === "payments"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Unassociated Payments ({payments.length})
          </button>
        </div>

        {/* Linking Drawer / Modal Form */}
        {linkingRecordId && (
          <div className="bg-slate-900/80 backdrop-blur-md border border-blue-500/30 rounded-2xl p-6 shadow-2xl animate-in fade-in slide-in-from-top duration-300">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <FiLink className="text-blue-400" />
              Link {linkingType === "po" ? "Purchase Order" : "Payment"} to Invoice
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Enter the exact Invoice Number to link this record (e.g. 10860).
            </p>
            <form onSubmit={handleLink} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={invoiceInput}
                onChange={(e) => setInvoiceInput(e.target.value)}
                placeholder="Invoice Number"
                className="bg-slate-950 border border-slate-800 rounded-lg py-2 px-4 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-grow"
                required
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isLinking}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2 px-5 rounded-lg transition flex items-center gap-2"
                >
                  {isLinking ? "Linking..." : "Link"}
                </button>
                <button
                  type="button"
                  onClick={() => { setLinkingRecordId(null); setLinkingType(null); }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2 px-5 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </form>
            {linkError && <p className="text-red-400 text-sm mt-2">{linkError}</p>}
            {linkSuccess && <p className="text-emerald-400 text-sm mt-2 flex items-center gap-1.5"><FiCheckCircle /> {linkSuccess}</p>}
          </div>
        )}

        {/* Content Table / List */}
        <div className="bg-slate-900/20 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <FiRefreshCw className="animate-spin text-3xl text-blue-400" />
              <span>Loading orphaned records...</span>
            </div>
          ) : activeTab === "pos" ? (
            pos.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <FiCheckCircle className="text-4xl text-emerald-400" />
                <span className="font-semibold text-white">No orphaned Purchase Orders</span>
                <span>All POs are associated with invoices or marked as inventory.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/60 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-4">PO Number</th>
                      <th className="px-6 py-4">Vendor</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Total</th>
                      <th className="px-6 py-4">Linked Sales Order</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/10">
                    {pos.map((po) => (
                      <tr key={po.id} className="hover:bg-slate-900/40 transition">
                        <td className="px-6 py-4 font-semibold text-white">
                          <div>{po.zohoId}</div>
                          {suggestions[po.zohoId] && (
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
                              <span>🎯 Suggested: Inv #{suggestions[po.zohoId].invoiceNumber} ({suggestions[po.zohoId].customerName})</span>
                              <span className="font-black text-[10px] bg-emerald-500/20 px-1 py-0.2 rounded text-emerald-300">{suggestions[po.zohoId].score}% Match</span>
                              <button
                                onClick={() => handleQuickLink(po.zohoId, suggestions[po.zohoId].invoiceNumber)}
                                className="ml-2 underline text-[11px] hover:text-white font-bold cursor-pointer"
                              >
                                Link Now
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">{po.vendorName || "Unknown Vendor"}</td>
                        <td className="px-6 py-4 flex items-center gap-1.5 text-slate-400">
                          <FiCalendar />
                          {po.date ? new Date(po.date).toLocaleDateString() : "N/A"}
                        </td>
                        <td className="px-6 py-4 font-bold text-white">${po.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-slate-400">
                          <div>{po.salesOrderNumber || "No Sales Order"}</div>
                          {(po as any).shipToName && <div className="text-[11px] text-blue-400 font-medium">Ship To: {(po as any).shipToName}</div>}
                        </td>
                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                          <button
                            onClick={() => { setLinkingRecordId(po.zohoId); setLinkingType("po"); }}
                            className="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1"
                          >
                            <FiLink /> Tie to Invoice
                          </button>
                          <button
                            onClick={() => handleMarkInventory(po.zohoId)}
                            className="bg-slate-800 text-slate-300 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1"
                          >
                            <FiArchive /> Inventory Stock
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            payments.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <FiCheckCircle className="text-4xl text-emerald-400" />
                <span className="font-semibold text-white">No orphaned Payments</span>
                <span>All customer payments are associated with active invoices.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/60 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-4">Payment ID</th>
                      <th className="px-6 py-4">Customer Name</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Mode</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/10">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-900/40 transition">
                        <td className="px-6 py-4 font-semibold text-white">{p.zohoId}</td>
                        <td className="px-6 py-4">{p.customerName || "N/A"}</td>
                        <td className="px-6 py-4 flex items-center gap-1.5 text-slate-400">
                          <FiCalendar />
                          {p.date ? new Date(p.date).toLocaleDateString() : "N/A"}
                        </td>
                        <td className="px-6 py-4">
                          <span className="bg-slate-850 px-2 py-0.5 rounded text-xs text-slate-300">
                            {p.mode || "Offline"}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-white">${p.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                          <button
                            onClick={() => { setLinkingRecordId(p.zohoId); setLinkingType("payment"); }}
                            className="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1"
                          >
                            <FiLink /> Tie to Invoice
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
      </div>
    </div>
    </div>
  )
}
