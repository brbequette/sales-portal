"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useZoho } from "@/components/ZohoProvider"
import Link from "next/link"
import { FiSearch, FiFilter, FiFileText, FiCheckCircle, FiAlertCircle, FiX, FiChevronRight } from "react-icons/fi"
import { createPortal } from "react-dom"

type SalesDoc = {
  id: string
  zohoId?: string
  type: "Quote" | "SalesOrder" | "Invoice"
  accountName: string
  accountZohoId: string
  status: string
  date: string
  amount: number
  profit: number
  invoiceNumber?: string
  raw: any
}

export default function SalesListPage() {
  const { zohoContext: user } = useZoho()
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<"All" | "Quote" | "SalesOrder" | "Invoice">("All")
  const [statusFilter, setStatusFilter] = useState<"All" | "Paid" | "Unpaid" | "Overdue">("All")
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false)
  const [viewingSalesDoc, setViewingSalesDoc] = useState<{ type: 'Quote' | 'SalesOrder' | 'Invoice', doc: any } | null>(null)
  const [showAllReps, setShowAllReps] = useState(false)
  const [selectedReps, setSelectedReps] = useState<string[]>([])

  const isAdmin = user?.role?.toLowerCase().includes("admin") || user?.role === "Administrator"

  useEffect(() => {
    if (user) {
      setShowAllReps(isAdmin)
    }
  }, [user, isAdmin])

  const fetchAccounts = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const ts = Date.now()
      const res = await fetch(`/api/get-accounts?zohoId=${user.zohoId || ''}&email=${encodeURIComponent(user.email || '')}&_t=${ts}`)
      const data = await res.json()
      if (data.success) {
        setAccounts(data.accounts)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const handleDeleteTransaction = async (type: string, id: string) => {
    if (!confirm(`Are you sure you want to delete this ${type}? This action cannot be undone in the hub.`)) return
    
    try {
      const res = await fetch("/api/delete-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id })
      })
      const data = await res.json()
      if (data.success) {
        setViewingSalesDoc(null)
        fetchAccounts()
      } else {
        alert(data.error || "Failed to delete transaction")
      }
    } catch (e: any) {
      alert("Network error: " + e.message)
    }
  }

  // Aggregate all docs
  const allDocs = useMemo(() => {
    const docs: SalesDoc[] = []
    accounts.forEach(a => {
      // Filter by reps if admin uses the dropdown
      const ownerName = a.owner?.name || ""
      if (showAllReps && selectedReps.length > 0 && !selectedReps.includes(ownerName)) {
        return
      }

      const buildDoc = (raw: any, t: "Quote" | "SalesOrder" | "Invoice"): SalesDoc => {
        let profit = 0
        if (raw.items && !Array.isArray(raw.items) && raw.items.profit) {
          profit = parseFloat(raw.items.profit)
        } else if (Array.isArray(raw.items)) {
          profit = raw.items.reduce((sum: number, it: any) => sum + parseFloat(it.profit || 0), 0)
        }
        
        return {
          id: raw.id,
          zohoId: raw.zohoId,
          type: t,
          accountName: a.name,
          accountZohoId: a.zohoId,
          status: raw.status || "Draft",
          date: raw.issueDate || raw.orderDate || raw.createdAt || new Date().toISOString(),
          amount: parseFloat(raw.amount || 0),
          profit,
          invoiceNumber: raw.items?.invoiceNumber,
          raw
        }
      }

      ;(a.quotes || []).forEach((q: any) => docs.push(buildDoc(q, "Quote")))
      ;(a.salesOrders || []).forEach((s: any) => docs.push(buildDoc(s, "SalesOrder")))
      ;(a.invoices || []).forEach((i: any) => docs.push(buildDoc(i, "Invoice")))
    })
    
    // Sort descending by date
    docs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return docs
  }, [accounts, user, showAllReps, selectedReps])

  const reps = useMemo(() => {
    const repSet = new Set<string>()
    accounts.forEach(a => { if (a.owner?.name) repSet.add(a.owner.name) })
    return Array.from(repSet).sort()
  }, [accounts])

  // Filter docs
  const filteredDocs = useMemo(() => {
    return allDocs.filter(d => {
      if (typeFilter !== "All" && d.type !== typeFilter) return false
      
      if (statusFilter === "Paid" && d.status !== "Paid") return false
      if (statusFilter === "Overdue" && d.status !== "Overdue" && d.status.toLowerCase() !== "overdue") return false
      if (statusFilter === "Unpaid") {
        if (d.status === "Paid" || d.status === "Void" || d.status === "Draft") return false
      }

      if (search) {
        const q = search.toLowerCase()
        if (
          !d.accountName.toLowerCase().includes(q) &&
          !d.id.toLowerCase().includes(q) &&
          !(d.zohoId || "").toLowerCase().includes(q) &&
          !(d.invoiceNumber || "").toLowerCase().includes(q)
        ) {
          return false
        }
      }

      return true
    })
  }, [allDocs, search, typeFilter, statusFilter])

  return (
    <div className="flex flex-col h-full bg-[#0a0f1e] text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between p-4 sm:p-6 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur shrink-0 gap-4">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
            <FiFileText className="text-blue-500" />
            Sales Documents
          </h1>
          <p className="text-xs text-neutral-400 mt-1">Manage Quotes, Orders, and Invoices.</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">

          <button 
            onClick={() => setShowFiltersDrawer(true)} 
            className={`p-2 rounded-lg border transition-all ${showFiltersDrawer ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-neutral-400"}`}
          >
            <FiFilter size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
        <div className="max-w-6xl mx-auto flex flex-col h-full">
          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="text-xs font-bold text-neutral-500 uppercase mr-2 tracking-wider">Type</span>
            {["All", "Quote", "SalesOrder", "Invoice"].map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  typeFilter === t 
                    ? "bg-blue-500/20 text-blue-400 border-blue-500/40 shadow-md shadow-blue-500/10" 
                    : "bg-neutral-800/50 text-neutral-400 border-neutral-700 hover:bg-neutral-800"
                }`}
              >
                {t === "SalesOrder" ? "Orders" : t === "Quote" ? "Quotes" : t === "Invoice" ? "Invoices" : "All Docs"}
              </button>
            ))}
            
            <div className="w-[1px] h-6 bg-neutral-800 mx-2" />
            
            <span className="text-xs font-bold text-neutral-500 uppercase mr-2 tracking-wider">Status</span>
            {["All", "Paid", "Unpaid", "Overdue"].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  statusFilter === s 
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-md shadow-emerald-500/10" 
                    : "bg-neutral-800/50 text-neutral-400 border-neutral-700 hover:bg-neutral-800"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">{filteredDocs.length} Documents</h2>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl flex-1 flex flex-col">
              {filteredDocs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-neutral-400">
                  <FiFileText size={48} className="mb-4 text-neutral-600" />
                  <p className="text-lg font-bold text-white mb-2">No documents found</p>
                  <p className="text-sm max-w-sm">Try adjusting your filters or search terms.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-neutral-950 border-b border-neutral-800 text-[10px] uppercase font-black tracking-wider text-neutral-500">
                        <th className="py-3 px-4 w-32">Date</th>
                        <th className="py-3 px-4 w-28">Type</th>
                        <th className="py-3 px-4 min-w-[150px]">Account</th>
                        <th className="py-3 px-4 w-32 text-right">Amount</th>
                        <th className="py-3 px-4 w-28 text-center">Status</th>
                        <th className="py-3 px-4 w-12 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/50">
                      {filteredDocs.map((doc, idx) => (
                        <tr 
                          key={idx}
                          onClick={() => setViewingSalesDoc({ type: doc.type, doc: doc.raw })}
                          className="hover:bg-neutral-800/50 cursor-pointer transition-colors group"
                        >
                          <td className="py-3 px-4 text-xs text-neutral-300">
                            {new Date(doc.date).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                              doc.type === "Invoice" ? "bg-emerald-900/40 text-emerald-400 border border-emerald-800/30" :
                              doc.type === "SalesOrder" ? "bg-blue-900/40 text-blue-400 border border-blue-800/30" :
                              "bg-purple-900/40 text-purple-400 border border-purple-800/30"
                            }`}>
                              {doc.type === "Invoice" ? "Invoice" : doc.type === "SalesOrder" ? "Order" : "Quote"}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-sm text-white">{doc.accountName}</div>
                            <div className="text-[10px] text-neutral-500 font-mono mt-0.5">#{doc.invoiceNumber || doc.zohoId?.slice(-6) || doc.id.slice(-6)}</div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="text-sm font-bold text-white">${doc.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            {doc.profit > 0 && <div className="text-[10px] text-sky-400 font-semibold mt-0.5">Profit: ${doc.profit.toLocaleString()}</div>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              doc.status === "Paid" ? "text-emerald-400" :
                              doc.status === "Overdue" || doc.status?.toLowerCase() === "overdue" ? "text-rose-400" :
                              "text-amber-400"
                            }`}>
                              {doc.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button className="text-neutral-500 hover:text-white p-1 rounded-full hover:bg-neutral-700 transition-colors">
                              <FiChevronRight />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Filters Popout Drawer ── */}
      {showFiltersDrawer && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFiltersDrawer(false)} />
          <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-neutral-900 border-l border-neutral-800 p-6 flex flex-col shadow-2xl text-white z-[9999]">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
                <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-neutral-300">
                  <FiFilter className="text-blue-400" /> Filters
                </h2>
                <button onClick={() => setShowFiltersDrawer(false)} className="text-neutral-400 hover:text-white p-1.5 rounded-full bg-neutral-800 transition-colors">
                  <FiX size={15} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto py-4 space-y-6 scrollbar-thin">
                {showAllReps && isAdmin && reps.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Sales Representative</label>
                    <select 
                      value={selectedReps[0] || ""} 
                      onChange={e => setSelectedReps(e.target.value ? [e.target.value] : [])}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="">All Reps</option>
                      {reps.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                )}
              </div>
          </div>
        </div>, document.body
      )}

      {/* ── Sales Document (Quote / Sales Order / Invoice) Details Modal ── */}
      {viewingSalesDoc && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setViewingSalesDoc(null)} />
          <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col shadow-2xl text-white z-[10001] p-6 max-h-[85vh]">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-neutral-800 mb-4 shrink-0">
              <div>
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                  <FiFileText className={viewingSalesDoc.type === 'Quote' ? "text-purple-500 animate-pulse" : viewingSalesDoc.type === 'SalesOrder' ? "text-blue-500 animate-pulse" : "text-emerald-500 animate-pulse"} />
                  <span>{viewingSalesDoc.type === 'Quote' ? 'Quote / Estimate Details' : viewingSalesDoc.type === 'SalesOrder' ? 'Sales Order Details' : 'Invoice Details'}</span>
                </h3>
                <p className="text-neutral-500 text-xs mt-0.5 font-mono">
                  Document ID: #{viewingSalesDoc.doc.id.slice(-6).toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(viewingSalesDoc.type === 'Quote' || viewingSalesDoc.type === 'SalesOrder') && (
                  <button 
                    onClick={() => handleDeleteTransaction(viewingSalesDoc.type, viewingSalesDoc.doc.id)} 
                    className="bg-red-900/30 hover:bg-red-900/60 text-red-400 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors border border-red-500/20"
                  >
                    Delete from Hub
                  </button>
                )}
                {viewingSalesDoc.type === 'Invoice' && (
                  <a
                    href={`/api/get-invoice-pdf?id=${viewingSalesDoc.doc.zohoId || viewingSalesDoc.doc.id}&download=true`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors border border-neutral-700 flex items-center gap-1.5 cursor-pointer"
                  >
                    Download PDF
                  </a>
                )}
                <button 
                  onClick={() => setViewingSalesDoc(null)} 
                  className="text-neutral-400 hover:text-white p-1 bg-neutral-800 hover:bg-neutral-755 transition-colors rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg cursor-pointer"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div className="space-y-4 overflow-y-auto flex-1 pr-1 scrollbar-thin">
              <div className="grid grid-cols-2 gap-4 bg-neutral-950/40 p-4 border border-neutral-800 rounded-xl">
                <div>
                  <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Status</span>
                  <p className={`text-xs font-bold mt-0.5 ${
                    viewingSalesDoc.doc.status === 'Accepted' || viewingSalesDoc.doc.status === 'Shipped' || viewingSalesDoc.doc.status === 'Processed' || viewingSalesDoc.doc.status === 'Paid'
                      ? 'text-emerald-400' 
                      : 'text-amber-400'
                  }`}>
                    {viewingSalesDoc.doc.status || 'Draft'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Date</span>
                  <p className="text-xs text-neutral-200 font-semibold mt-0.5">
                    {new Date(viewingSalesDoc.doc.issueDate || viewingSalesDoc.doc.orderDate || viewingSalesDoc.doc.createdAt || Date.now()).toLocaleDateString()}
                  </p>
                </div>
                {viewingSalesDoc.type === 'Quote' && viewingSalesDoc.doc.validUntil && (
                  <div>
                    <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Valid Until</span>
                    <p className="text-xs text-neutral-200 font-semibold mt-0.5">
                      {new Date(viewingSalesDoc.doc.validUntil).toLocaleDateString()}
                    </p>
                  </div>
                )}
                {viewingSalesDoc.type === 'Invoice' && viewingSalesDoc.doc.dueDate && (
                  <div>
                    <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Due Date</span>
                    <p className="text-xs text-neutral-200 font-semibold mt-0.5">
                      {new Date(viewingSalesDoc.doc.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>

              {/* Line Items */}
              <div>
                <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <FiCheckCircle className="text-blue-500" /> Line Items
                </h4>
                <div className="space-y-2">
                  {(!viewingSalesDoc.doc.items || (Array.isArray(viewingSalesDoc.doc.items) && viewingSalesDoc.doc.items.length === 0)) ? (
                    <div className="bg-neutral-800/30 p-3 rounded-lg border border-neutral-800 text-sm text-neutral-400">
                      No line items detailed.
                    </div>
                  ) : Array.isArray(viewingSalesDoc.doc.items) ? (
                    viewingSalesDoc.doc.items.map((item: any, i: number) => (
                      <div key={i} className="bg-neutral-800/30 p-3 rounded-lg border border-neutral-800 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-bold text-white">{typeof item === 'string' ? item : (item.name || 'Unknown Item')}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-neutral-400 font-mono">{(typeof item !== 'string' && item.sku) ? item.sku : 'SKU: N/A'}</span>
                            <span className="text-[10px] text-neutral-500">|</span>
                            <span className="text-[10px] text-neutral-400">Vendor: {(typeof item !== 'string' && item.vendor) ? item.vendor : 'N/A'}</span>
                          </div>
                          {typeof item !== 'string' && item.quantity && (
                            <p className="text-xs text-neutral-400 mt-1">Qty: {item.quantity} x ${parseFloat(item.price || item.rate || 0).toLocaleString()}</p>
                          )}
                        </div>
                        <div className="text-right">
                          {typeof item !== 'string' && item.amount && (
                            <p className="text-sm font-bold text-emerald-400">${parseFloat(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                          )}
                          {typeof item !== 'string' && item.cost && (
                            <p className="text-[10px] text-amber-400 font-semibold mt-0.5">Cost: ${parseFloat(item.cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                          )}
                          {typeof item !== 'string' && item.profit && (
                            <p className="text-[10px] text-sky-400 font-semibold mt-0.5">Profit: ${parseFloat(item.profit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    // It's an object instead of array (e.g. from Zoho directly)
                    <div className="bg-neutral-800/30 p-3 rounded-lg border border-neutral-800 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-bold text-white">Invoice Items Summary</p>
                        <p className="text-xs text-neutral-400 mt-0.5">Details aggregated.</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-400">${parseFloat(viewingSalesDoc.doc.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Total Summary */}
              <div className="flex justify-between items-center pt-4 border-t border-neutral-800">
                <span className="text-sm font-bold text-neutral-400 uppercase">Total Amount</span>
                <span className="text-xl font-black text-white">
                  ${parseFloat(viewingSalesDoc.doc.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
