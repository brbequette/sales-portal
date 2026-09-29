"use client"

import { useState, useEffect, useMemo, useCallback, Fragment } from "react"
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
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiExternalLink,
  FiMapPin,
  FiTag,
  FiList,
  FiUser,
  FiLayers,
  FiInfo,
  FiEye,
  FiChevronLeft,
  FiChevronRight
} from "react-icons/fi"
import { InvoiceDetailsModal } from "@/components/InvoiceDetailsModal"

interface PurchaseOrder {
  id: string
  zohoId: string
  poNumber?: string | null
  vendorName: string | null
  shipToName?: string | null
  shippingAddress?: string | null
  referenceNumber: string | null
  date: string | null
  total: number
  status: string | null
  salesOrderId?: string | null
  salesOrderNumber: string | null
  isDropshipment: boolean
  trackingNumber?: string | null
  items?: any
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

interface InvoiceSearchResult {
  id: string
  zohoId: string
  docType?: "Invoice" | "SalesOrder" | "Estimate"
  docNumber?: string
  invoiceNumber: string
  customerName: string
  issueDate: string | null
  totalAmount: number
  status: string | null
  referenceNumber: string | null
  shipTo?: string | null
}

// Sub-component for interactive invoice search within an expanded PO row
function ExpandedRowSearch({
  recordZohoId,
  type,
  initialQuery,
  onLink,
  onViewDoc
}: {
  recordZohoId: string
  type: "po" | "payment"
  initialQuery: string
  onLink: (recordZohoId: string, invoiceNumber: string) => Promise<void>
  onViewDoc: (doc: { zohoId: string; docNumber: string; type: "Invoice" | "SalesOrder" | "Quote" }) => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<InvoiceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [linkingInv, setLinkingInv] = useState<string | null>(null)

  const performSearch = useCallback(async (q: string) => {
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/orphans/search-invoices?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (data.success && data.invoices) {
        setResults(data.invoices)
      }
    } catch (e) {
      console.error("Error searching invoices:", e)
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    performSearch(query)
  }, [query, performSearch])

  const handleExecuteLink = async (invoiceNumber: string) => {
    setLinkingInv(invoiceNumber)
    try {
      await onLink(recordZohoId, invoiceNumber)
    } finally {
      setLinkingInv(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <FiSearch className="text-blue-400" /> Search Sales Docs (Invoices, Sales Orders & Estimates)
        </label>
        {searching && <span className="text-xs text-blue-400 animate-pulse">Searching...</span>}
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by Invoice #, SO #, Estimate #, Customer Name, Ref #, Address, SKU..."
          className="w-full bg-slate-950 border border-slate-750 rounded-xl py-2 px-3 pl-9 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <FiSearch className="absolute left-3 top-2.5 text-slate-500" size={13} />
      </div>

      <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {results.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
            {searching ? "Searching sales documents..." : "No matching documents found. Try changing your search query."}
          </div>
        ) : (
          results.map((inv) => {
            const dType = inv.docType || "Invoice"
            const dNum = inv.docNumber || inv.invoiceNumber
            const typeLabel = dType === "SalesOrder" ? "SO" : dType === "Estimate" ? "Est" : "Inv"
            const badgeBg = dType === "SalesOrder" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : dType === "Estimate" ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "bg-blue-500/20 text-blue-300 border-blue-500/30"

            return (
              <div
                key={inv.id}
                className="bg-slate-950/70 hover:bg-slate-900 border border-slate-800 hover:border-blue-500/40 rounded-xl p-2.5 flex items-center justify-between gap-3 transition"
              >
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${badgeBg}`}>
                      {typeLabel} #{dNum}
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                      ${inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {inv.status && (
                      <span className="text-[10px] uppercase font-semibold text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
                        {inv.status}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-300 font-medium truncate mt-0.5">
                    {inv.customerName}
                  </div>
                  {(inv.referenceNumber || inv.issueDate || inv.shipTo) && (
                    <div className="text-[11px] text-slate-500 flex items-center gap-3 mt-0.5 flex-wrap">
                      {inv.issueDate && <span>Date: {new Date(inv.issueDate).toLocaleDateString()}</span>}
                      {inv.referenceNumber && <span>Ref: {inv.referenceNumber}</span>}
                      {inv.shipTo && <span className="truncate max-w-[180px]">Ship: {inv.shipTo}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onViewDoc({ zohoId: inv.zohoId, docNumber: dNum, type: dType === "SalesOrder" ? "SalesOrder" : dType === "Estimate" ? "Quote" : "Invoice" })}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-2.5 py-1.5 rounded-lg text-xs transition flex items-center gap-1"
                    title="Review document in popup"
                  >
                    <FiEye size={12} /> Review
                  </button>
                  <button
                    onClick={() => handleExecuteLink(dNum)}
                    disabled={linkingInv === dNum}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-1 disabled:opacity-50"
                  >
                    <FiLink size={12} />
                    {linkingInv === dNum ? "Linking..." : "Link"}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default function OrphanedRecordsPage() {
  const [activeTab, setActiveTab] = useState<"pos" | "payments">("pos")
  const [pos, setPOs] = useState<PurchaseOrder[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState("")

  // Expanded Row State
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  // Selected Sales Document for Review Popup Modal
  const [selectedSalesDoc, setSelectedSalesDoc] = useState<{
    zohoId: string
    docNumber: string
    type: "Invoice" | "SalesOrder" | "Quote"
  } | null>(null)

  // Link Form State
  const [linkingRecordId, setLinkingRecordId] = useState<string | null>(null)
  const [linkingType, setLinkingType] = useState<"po" | "payment" | null>(null)
  const [invoiceInput, setInvoiceInput] = useState("")
  const [linkError, setLinkError] = useState("")
  const [linkSuccess, setLinkSuccess] = useState("")
  const [isLinking, setIsLinking] = useState(false)

  // Smart Matching & Filter States
  const [suggestions, setSuggestions] = useState<Record<string, any>>({})
  const [autoMatching, setAutoMatching] = useState(false)
  const [tableSearch, setTableSearch] = useState("")
  const [dateFilter, setDateFilter] = useState<"all" | "dated" | "missing">("all")
  const [tableSort, setTableSort] = useState<"date-desc" | "date-asc" | "amount-desc" | "amount-asc" | "name-asc">("date-desc")

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number | "all">(25)

  // Summary Counts & Server Totals
  const [poCount, setPoCount] = useState(0)
  const [paymentCount, setPaymentCount] = useState(0)
  const [totalServerRecords, setTotalServerRecords] = useState(0)
  const [serverTotalPages, setServerTotalPages] = useState(1)

  // Reset page to 1 when search, filter, sort, tab, or page size changes
  const handleTabChange = (newTab: "pos" | "payments") => {
    setActiveTab(newTab)
    setCurrentPage(1)
    setLinkingRecordId(null)
    setExpandedRowId(null)
  }

  const handleSearchChange = (val: string) => {
    setTableSearch(val)
    setCurrentPage(1)
  }

  const handleDateFilterChange = (val: "all" | "dated" | "missing") => {
    setDateFilter(val)
    setCurrentPage(1)
  }

  const handleSortChange = (val: typeof tableSort) => {
    setTableSort(val)
    setCurrentPage(1)
  }

  const handlePageSizeChange = (val: string) => {
    setPageSize(val === "all" ? "all" : parseInt(val, 10))
    setCurrentPage(1)
  }

  const fetchSuggestions = async (poIds?: string) => {
    try {
      const url = poIds ? `/api/admin/orphans/suggest-matches?poIds=${encodeURIComponent(poIds)}` : `/api/admin/orphans/suggest-matches`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        if (data.suggestions) {
          setSuggestions(prev => ({ ...prev, ...data.suggestions }))
        }
        if (data.autoApprovedCount && data.autoApprovedCount > 0) {
          setSyncMessage(`Auto-approved and linked ${data.autoApprovedCount} 85%+ matched Purchase Order(s)!`)
          setTimeout(() => setSyncMessage(""), 5000)
          fetchData()
        }
      }
    } catch (e) {
      console.error("Error fetching match suggestions:", e)
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", String(currentPage))
      params.set("limit", String(pageSize))
      params.set("tab", activeTab)
      if (tableSearch.trim()) params.set("q", tableSearch.trim())
      if (dateFilter !== "all") params.set("dateFilter", dateFilter)
      params.set("sort", tableSort)

      const res = await fetch(`/api/admin/orphans?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        if (activeTab === "pos") {
          setPOs(data.purchaseOrders || [])
          setPayments([])
        } else {
          setPOs([])
          setPayments(data.payments || [])
        }
        setTotalServerRecords(data.totalCount || 0)
        setPoCount(data.poCount || 0)
        setPaymentCount(data.paymentCount || 0)
        setServerTotalPages(data.totalPages || 1)

        // Fetch match suggestions ONLY for the POs on the current page for lightning speed
        if (activeTab === "pos" && data.purchaseOrders && data.purchaseOrders.length > 0) {
          const pagePoIds = data.purchaseOrders.map((p: any) => p.zohoId).join(",")
          fetchSuggestions(pagePoIds)
        }
      }
    } catch (e) {
      console.error("Error fetching orphans:", e)
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, activeTab, tableSearch, dateFilter, tableSort])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAutoMatch = async () => {
    setAutoMatching(true)
    setSyncMessage("Scanning unassociated POs against Invoices, Sales Orders & Estimates for matches...")
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

  const handleQuickLink = async (recordZohoId: string, invoiceNumber: string) => {
    setIsLinking(true)
    try {
      const res = await fetch("/api/admin/orphans/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab === "pos" ? "po" : "payment",
          id: recordZohoId,
          invoiceNumber
        })
      })
      const data = await res.json()
      if (data.success) {
        setLinkSuccess(data.message)
        // Instantly remove matched item from view so it falls off immediately
        if (activeTab === "pos") {
          setPOs(prev => prev.filter(p => p.zohoId !== recordZohoId && p.id !== recordZohoId))
        } else {
          setPayments(prev => prev.filter(p => p.zohoId !== recordZohoId && p.id !== recordZohoId))
        }
        fetchData()
        setTimeout(() => setLinkSuccess(""), 4000)
      } else {
        alert(data.error || "Failed to link record")
      }
    } catch (e: any) {
      console.error("Quick link failed", e)
      alert(e.message || "Link failed")
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
          setLinkingRecordId(null);
          setLinkingType(null);
          setLinkSuccess("");
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

  // Get display PO Number
  const getDisplayPONumber = (po: PurchaseOrder) => {
    if (po.poNumber && po.poNumber.trim()) return po.poNumber.trim()
    const itemPoNum = po.items?.purchaseorder_number || po.items?.po_number
    if (itemPoNum) return String(itemPoNum).trim()
    return po.zohoId
  }

  const startRecordNum = totalServerRecords === 0 ? 0 : pageSize === "all" ? 1 : (currentPage - 1) * (pageSize as number) + 1
  const endRecordNum = pageSize === "all" ? totalServerRecords : Math.min(currentPage * (pageSize as number), totalServerRecords)

  return (
    <div className="page-content">
      {/* ─── Document Review Details Modal (Invoices, Sales Orders, Estimates) ─────────────── */}
      {selectedSalesDoc && (
        <InvoiceDetailsModal
          invoice={{
            zohoId: selectedSalesDoc.zohoId,
            invoiceNumber: selectedSalesDoc.docNumber,
            salesorder_number: selectedSalesDoc.docNumber,
            quote_number: selectedSalesDoc.docNumber,
            estimate_number: selectedSalesDoc.docNumber
          }}
          type={selectedSalesDoc.type}
          onClose={() => setSelectedSalesDoc(null)}
        />
      )}

      {/* ─── Header ─────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center">
            <FiPackage className="text-red-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Orphaned Files Manager</h1>
            <p className="page-subtitle">Link unassociated Purchase Orders and Payments across Invoices, Sales Orders & Estimates</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoMatch}
            disabled={autoMatching}
            className="td-btn td-btn-primary td-btn-sm disabled:opacity-50"
          >
            <FiCheck size={13} className={autoMatching ? "animate-spin" : ""} />
            {autoMatching ? "Matching..." : "Auto-Link Confident Matches"}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="td-btn td-btn-ghost td-btn-sm disabled:opacity-50"
          >
            <FiRefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync POs & Payments"}
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
              <div className="text-3xl font-bold text-white mt-0.5">{poCount}</div>
            </div>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 flex items-center gap-5">
            <div className="p-4 bg-amber-500/10 text-amber-400 rounded-xl">
              <FiDollarSign className="text-2xl" />
            </div>
            <div>
              <div className="text-sm text-slate-400 font-medium">Orphaned Payments</div>
              <div className="text-3xl font-bold text-white mt-0.5">{paymentCount}</div>
            </div>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="border-b border-slate-800 flex gap-6">
          <button
            onClick={() => handleTabChange("pos")}
            className={`pb-4 text-lg font-semibold transition ${
              activeTab === "pos"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Unassociated POs ({poCount})
          </button>
          <button
            onClick={() => handleTabChange("payments")}
            className={`pb-4 text-lg font-semibold transition ${
              activeTab === "payments"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Unassociated Payments ({paymentCount})
          </button>
        </div>

        {/* Linking Drawer / Modal Form */}
        {linkingRecordId && (
          <div className="bg-slate-900/80 backdrop-blur-md border border-blue-500/30 rounded-2xl p-6 shadow-2xl animate-in fade-in slide-in-from-top duration-300">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <FiLink className="text-blue-400" />
              Link {linkingType === "po" ? "Purchase Order" : "Payment"} to Sales Document
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Enter the exact Invoice Number, Sales Order Number, or Estimate Number (e.g. 10860 or 46392).
            </p>
            <form onSubmit={handleLink} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={invoiceInput}
                onChange={(e) => setInvoiceInput(e.target.value)}
                placeholder="Invoice, Sales Order, or Estimate Number"
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
          {!loading && (
            <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/40 p-4 lg:flex-row lg:items-center justify-between">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center flex-1">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Search orphaned records</span>
                  <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={tableSearch}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    placeholder={activeTab === "pos" ? "Search PO, vendor, status, address, or sales order..." : "Search payment, customer, mode, or reference..."}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-10 pr-4 text-xs text-white outline-none focus:border-blue-500"
                  />
                </label>
                <select aria-label="Filter by date availability" value={dateFilter} onChange={(event) => handleDateFilterChange(event.target.value as typeof dateFilter)} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
                  <option value="all">All dates</option>
                  <option value="dated">Has date</option>
                  <option value="missing">Missing date</option>
                </select>
                <select aria-label="Sort orphaned records" value={tableSort} onChange={(event) => handleSortChange(event.target.value as typeof tableSort)} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
                  <option value="date-desc">Newest date</option>
                  <option value="date-asc">Oldest date</option>
                  <option value="amount-desc">Highest amount</option>
                  <option value="amount-asc">Lowest amount</option>
                  <option value="name-asc">Name A–Z</option>
                </select>
              </div>

              {/* Pagination Per Page Dropdown & Counter */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <span>Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs font-semibold focus:outline-none focus:border-blue-500"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value="all">All</option>
                  </select>
                </div>
                <span className="text-slate-400 font-medium">
                  Showing <strong className="text-white">{startRecordNum}–{endRecordNum}</strong> of <strong className="text-white">{totalServerRecords}</strong>
                </span>
              </div>
            </div>
          )}

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
                <span>All POs are associated with sales documents or marked as inventory.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="w-10 px-3 py-3.5 text-center"></th>
                      <th className="px-4 py-3.5 text-left">PO Number</th>
                      <th className="px-4 py-3.5 text-left">Suggested Match</th>
                      <th className="px-4 py-3.5 text-left">Vendor & Ship To Address</th>
                      <th className="px-4 py-3.5 text-left">Date</th>
                      <th className="px-4 py-3.5 text-left">Total</th>
                      <th className="px-4 py-3.5 text-left">Linked Sales Order</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/10">
                    {pos.map((po) => {

                      const isExpanded = expandedRowId === po.zohoId
                      const displayPO = getDisplayPONumber(po)
                      const targetSO = po.salesOrderNumber || po.referenceNumber
                      const poSuggestions = suggestions[po.zohoId]
                      const topMatch = poSuggestions?.bestMatch || (poSuggestions?.score ? poSuggestions : null)
                      const candidatesList: any[] = poSuggestions?.candidates || (topMatch ? [topMatch] : [])

                      const displayShipName = po.shipToName || po.items?.delivery_customer_name || po.items?.customer_name
                      const displayShipAddr = po.shippingAddress || po.items?.delivery_address || po.items?.shipping_address || po.items?.recipient_address

                      return (
                        <Fragment key={po.id}>
                          <tr
                            className="transition hover:bg-slate-850/40 cursor-pointer"
                            onClick={() => setExpandedRowId(isExpanded ? null : po.zohoId)}
                          >
                            <td className="w-10 px-3 py-4 text-center">
                              <button
                                type="button"
                                aria-label="Expand row details"
                                onClick={(e) => { e.stopPropagation(); setExpandedRowId(isExpanded ? null : po.zohoId); }}
                                className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition"
                              >
                                {isExpanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                              </button>
                            </td>

                            <td className="px-4 py-4 font-semibold text-white">
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-white tracking-tight">{displayPO}</span>
                                {po.isDropshipment && (
                                  <span className="text-[10px] uppercase font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded">
                                    Dropship
                                  </span>
                                )}
                              </div>
                              {displayPO !== po.zohoId && (
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  ID: {po.zohoId}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                              {topMatch ? (
                                <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-2 space-y-1 min-w-[190px] max-w-xs shadow-sm">
                                  <div className="flex items-center justify-between gap-1 flex-wrap">
                                    <span className="text-[10px] font-black uppercase text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                      {topMatch.docType || 'Inv'} #{topMatch.docNumber || topMatch.invoiceNumber}
                                    </span>
                                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                      🎯 {topMatch.score}% Match
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-200 font-semibold truncate" title={topMatch.customerName}>
                                    {topMatch.customerName}
                                  </div>
                                  <div className="flex items-center gap-1.5 pt-0.5">
                                    <button
                                      onClick={() => setSelectedSalesDoc({
                                        zohoId: topMatch.docId || topMatch.invoiceId,
                                        docNumber: topMatch.docNumber || topMatch.invoiceNumber,
                                        type: (topMatch.docType as any) || "Invoice"
                                      })}
                                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-2 py-1 rounded text-[11px] transition flex items-center gap-1"
                                      title="Review document details"
                                    >
                                      <FiEye size={11} /> Review
                                    </button>
                                    <button
                                      onClick={() => handleQuickLink(po.zohoId, topMatch.docNumber || topMatch.invoiceNumber)}
                                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 rounded text-[11px] transition flex items-center gap-1"
                                    >
                                      <FiLink size={11} /> Link Now
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500 italic">No match suggested</span>
                              )}
                            </td>

                            <td className="px-4 py-4 max-w-xs">
                              <div className="font-semibold text-slate-200 truncate">{po.vendorName || "Unknown Vendor"}</div>
                              {(displayShipName || displayShipAddr) && (
                                <div className="text-[11px] text-blue-300/90 font-medium truncate mt-0.5 flex items-center gap-1" title={`${displayShipName || ''} ${displayShipAddr || ''}`}>
                                  <FiMapPin size={11} className="text-blue-400 flex-shrink-0" />
                                  <span className="truncate">
                                    {displayShipName ? `To: ${displayShipName}` : ''}
                                    {displayShipName && displayShipAddr ? ' — ' : ''}
                                    {displayShipAddr || ''}
                                  </span>
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-4 text-slate-400 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <FiCalendar size={13} />
                                {po.date ? new Date(po.date).toLocaleDateString() : "N/A"}
                              </div>
                            </td>

                            <td className="px-4 py-4 font-bold text-white whitespace-nowrap">
                              ${po.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            <td className="px-4 py-4 text-slate-400" onClick={(e) => e.stopPropagation()}>
                              {targetSO ? (
                                <button
                                  onClick={() => setSelectedSalesDoc({ zohoId: po.salesOrderId || targetSO, docNumber: targetSO, type: "SalesOrder" })}
                                  className="inline-flex items-center gap-1.5 font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-2.5 py-1 rounded-lg transition text-xs cursor-pointer group whitespace-nowrap"
                                  title="Click to popup Sales Order review details"
                                >
                                  <span>SO #{targetSO}</span>
                                  <FiExternalLink size={12} className="group-hover:translate-x-0.5 transition-transform" />
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500 italic">No Sales Order</span>
                              )}
                              {po.referenceNumber && po.referenceNumber !== targetSO && (
                                <div className="text-[11px] text-amber-400 font-mono mt-1">
                                  Ref: {po.referenceNumber}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={() => setExpandedRowId(isExpanded ? null : po.zohoId)}
                                  className="bg-slate-800 text-slate-300 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 whitespace-nowrap"
                                >
                                  {isExpanded ? "Collapse" : "Find Match"}
                                </button>
                                <button
                                  onClick={() => { setLinkingRecordId(po.zohoId); setLinkingType("po"); }}
                                  className="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 whitespace-nowrap"
                                >
                                  <FiLink /> Tie
                                </button>
                                <button
                                  onClick={() => handleMarkInventory(po.zohoId)}
                                  className="bg-slate-800 text-slate-300 hover:bg-slate-700 p-2 rounded-lg text-xs transition"
                                  title="Mark Inventory Stock"
                                >
                                  <FiArchive />
                                </button>
                              </div>
                            </td>
                          </tr>

                            {/* ─── Expanded Drawer Section ─────────────────── */}
                            {isExpanded && (
                              <tr key={`${po.id}-expanded`} className="bg-slate-950/90">
                                <td colSpan={8} className="p-0 border-b border-slate-800">
                                  <div className="border-t border-blue-500/20 bg-slate-950/90 p-6 shadow-2xl animate-in fade-in duration-200">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                                  {/* Left Col: PO Reference & Metadata */}
                                  <div className="lg:col-span-5 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-800 pb-6 lg:pb-0 lg:pr-6">
                                    <div className="flex items-center justify-between">
                                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <FiPackage className="text-blue-400" />
                                        Purchase Order Details
                                      </h3>
                                      <span className="text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                                        PO #{displayPO}
                                      </span>
                                    </div>

                                    {/* Reference Information Highlight Box */}
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-1.5">
                                      <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                        <FiInfo size={14} />
                                        Pertinent Reference & Historical Document Matching
                                      </div>
                                      <div className="text-xs text-slate-200 font-mono font-semibold">
                                        Reference Number: {po.referenceNumber || po.salesOrderNumber || "None specified"}
                                      </div>
                                      <p className="text-[11px] text-slate-300 leading-relaxed">
                                        💡 <strong>Historical Context:</strong> Orders prior to 2026 went directly from Estimate → Invoice without a Sales Order. POs were created manually. Matches search across Estimates, Sales Orders & Invoices by customer address, SKU items, dates, and amounts.
                                      </p>
                                    </div>

                                    {/* PO Information Grid */}
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                                        <div className="text-slate-500 font-medium">Vendor</div>
                                        <div className="text-white font-bold mt-0.5 truncate">{po.vendorName || "Unknown"}</div>
                                      </div>
                                      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                                        <div className="text-slate-500 font-medium">Total Amount</div>
                                        <div className="text-emerald-400 font-bold mt-0.5">${po.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                      </div>

                                      {/* PO Shipping Address / Recipient (Dropship Target) */}
                                      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 col-span-2 space-y-1">
                                        <div className="text-slate-400 font-bold text-xs flex items-center gap-1.5">
                                          <FiMapPin size={13} className="text-blue-400" /> PO Shipping Address / Recipient (Dropship Target)
                                        </div>
                                        <div className="text-slate-100 font-bold text-xs">
                                          {displayShipName || "Customer / Recipient Not Specified"}
                                        </div>
                                        {displayShipAddr ? (
                                          <div className="text-[11px] text-slate-300 mt-1 leading-normal font-mono bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                                            {displayShipAddr}
                                          </div>
                                        ) : (
                                          <div className="text-[11px] text-slate-500 italic mt-0.5">
                                            No street address recorded on PO. Matches against Customer Account & Document addresses.
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* PO Line Items list if available */}
                                    {po.items && (po.items.lineItems || po.items.line_items) && (
                                      <div className="space-y-2">
                                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                          <FiList size={13} className="text-blue-400" /> PO Line Items
                                        </div>
                                        <div className="max-h-36 overflow-y-auto bg-slate-900/80 border border-slate-800 rounded-xl p-2 space-y-1.5 text-xs custom-scrollbar">
                                          {((po.items.lineItems || po.items.line_items) as any[]).map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between border-b border-slate-800/60 last:border-0 pb-1 pt-0.5">
                                              <span className="text-slate-200 font-medium truncate max-w-[200px]">{item.name || item.sku || "Item"}</span>
                                              <span className="text-slate-400 font-mono">Qty: {item.quantity || 1}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Right Col: Candidate Matches & Search Workspace */}
                                  <div className="lg:col-span-7 space-y-5">

                                    {/* All Suggested Candidate Matches Section */}
                                    {candidatesList.length > 0 && (
                                      <div className="space-y-3">
                                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                                          <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                                            <FiLayers /> All Suggested Document Matches ({candidatesList.length})
                                          </span>
                                          <span className="text-[11px] text-slate-500 font-normal">Ranked by address, items, dates & ref #</span>
                                        </div>

                                        <div className="max-h-80 overflow-y-auto grid grid-cols-1 gap-2.5 pr-1 custom-scrollbar">
                                          {candidatesList.map((cand, cIdx) => {
                                            const dType = cand.docType || "Invoice"
                                            const dNum = cand.docNumber || cand.invoiceNumber
                                            const badgeStyle = dType === "SalesOrder" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : dType === "Estimate" ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "bg-blue-500/20 text-blue-300 border-blue-500/30"

                                            return (
                                              <div
                                                key={cIdx}
                                                className="bg-slate-900/90 hover:bg-slate-900 border border-emerald-500/30 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md"
                                              >
                                                <div className="space-y-1 min-w-0 flex-1">
                                                  <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${badgeStyle}`}>
                                                      {dType} #{dNum}
                                                    </span>
                                                    <span className="text-xs text-slate-300 font-semibold">{cand.customerName}</span>
                                                    <span className="text-[11px] font-black bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/30">
                                                      🎯 {cand.score}% Match
                                                    </span>
                                                  </div>

                                                  <div className="flex items-center gap-3 text-xs text-slate-400">
                                                    <span>Amount: <strong className="text-white">${(cand.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                                    {cand.issueDate && <span>Date: {new Date(cand.issueDate).toLocaleDateString()}</span>}
                                                  </div>

                                                  {/* Match Reason Breakdown Badges */}
                                                  {cand.reasons && cand.reasons.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                                      {cand.reasons.map((r: string, rIdx: number) => (
                                                        <span key={rIdx} className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-medium">
                                                          ✓ {r}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>

                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                  <button
                                                    onClick={() => setSelectedSalesDoc({ zohoId: cand.docId || cand.invoiceId, docNumber: dNum, type: dType === "SalesOrder" ? "SalesOrder" : dType === "Estimate" ? "Quote" : "Invoice" })}
                                                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-2 rounded-lg text-xs transition flex items-center gap-1"
                                                    title="Review document in popup"
                                                  >
                                                    <FiEye size={12} /> Review
                                                  </button>
                                                  <button
                                                    onClick={() => handleQuickLink(po.zohoId, dNum)}
                                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap shadow-lg"
                                                  >
                                                    <FiLink size={13} />
                                                    Link to #{dNum}
                                                  </button>
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    {/* Real-time Invoice Search Component */}
                                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                                      <ExpandedRowSearch
                                        recordZohoId={po.zohoId}
                                        type="po"
                                        initialQuery={displayShipAddr || displayShipName || po.referenceNumber || po.salesOrderNumber || ""}
                                        onLink={handleQuickLink}
                                        onViewDoc={(doc) => setSelectedSalesDoc(doc)}
                                      />
                                    </div>

                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
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
                  <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="w-10 px-3 py-3.5 text-center"></th>
                      <th className="px-4 py-3.5 text-left">Payment ID</th>
                      <th className="px-4 py-3.5 text-left">Customer Name</th>
                      <th className="px-4 py-3.5 text-left">Date</th>
                      <th className="px-4 py-3.5 text-left">Mode</th>
                      <th className="px-4 py-3.5 text-left">Amount</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/10">
                    {payments.map((p: Payment) => {
                      const isExpanded = expandedRowId === p.zohoId
                      return (
                        <Fragment key={p.id}>
                          <tr
                            className="transition hover:bg-slate-850/40 cursor-pointer"
                            onClick={() => setExpandedRowId(isExpanded ? null : p.zohoId)}
                          >
                            <td className="w-10 px-3 py-4 text-center">
                              <button
                                type="button"
                                aria-label="Expand row details"
                                onClick={(e) => { e.stopPropagation(); setExpandedRowId(isExpanded ? null : p.zohoId); }}
                                className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition"
                              >
                                {isExpanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                              </button>
                            </td>
                            <td className="px-4 py-4 font-semibold text-white">{p.zohoId}</td>
                            <td className="px-4 py-4">{p.customerName || "N/A"}</td>
                            <td className="px-4 py-4 text-slate-400 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <FiCalendar />
                                {p.date ? new Date(p.date).toLocaleDateString() : "N/A"}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className="bg-slate-850 px-2 py-0.5 rounded text-xs text-slate-300">
                                {p.mode || "Offline"}
                              </span>
                            </td>
                            <td className="px-4 py-4 font-bold text-white whitespace-nowrap">${p.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={() => setExpandedRowId(isExpanded ? null : p.zohoId)}
                                  className="bg-slate-800 text-slate-300 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1"
                                >
                                  {isExpanded ? "Collapse" : "Find Match"}
                                </button>
                                <button
                                  onClick={() => { setLinkingRecordId(p.zohoId); setLinkingType("payment"); }}
                                  className="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1"
                                >
                                  <FiLink /> Tie to Invoice
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${p.id}-expanded`} className="bg-slate-950/90">
                              <td colSpan={7} className="p-0 border-b border-slate-800">
                                <div className="border-t border-blue-500/20 bg-slate-950/90 p-6 shadow-2xl animate-in fade-in duration-200">
                                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                    <div className="lg:col-span-5 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-800 pb-6 lg:pb-0 lg:pr-6">
                                      <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                          <FiDollarSign className="text-amber-400" />
                                          Payment Details
                                        </h3>
                                        <span className="text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                                          ID: {p.zohoId}
                                        </span>
                                      </div>
                                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-1">
                                        <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                          <FiInfo size={14} /> Pertinent Payment Reference
                                        </div>
                                        <div className="text-xs text-slate-200 font-mono font-semibold">
                                          Reference Number: {p.referenceNumber || "None"}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                                          <div className="text-slate-500 font-medium">Customer Name</div>
                                          <div className="text-white font-bold mt-0.5 truncate">{p.customerName || "N/A"}</div>
                                        </div>
                                        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                                          <div className="text-slate-500 font-medium">Payment Amount</div>
                                          <div className="text-amber-400 font-bold mt-0.5">${p.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="lg:col-span-7">
                                      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                                        <ExpandedRowSearch
                                          recordZohoId={p.zohoId}
                                          type="payment"
                                          initialQuery={p.referenceNumber || p.customerName || ""}
                                          onLink={handleQuickLink}
                                          onViewDoc={(doc) => setSelectedSalesDoc(doc)}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ─── Pagination Footer ────────────────────────────── */}
          {!loading && serverTotalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-800 bg-slate-950/60 text-xs">
              <div className="text-slate-400">
                Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{serverTotalPages}</strong>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 font-semibold"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1 font-semibold"
                >
                  <FiChevronLeft size={14} /> Prev
                </button>
                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: Math.min(5, serverTotalPages) }, (_, i) => {
                    let pageNum = currentPage
                    if (serverTotalPages <= 5) pageNum = i + 1
                    else if (currentPage <= 3) pageNum = i + 1
                    else if (currentPage >= serverTotalPages - 2) pageNum = serverTotalPages - 4 + i
                    else pageNum = currentPage - 2 + i

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                          currentPage === pageNum
                            ? "bg-blue-600 text-white"
                            : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(serverTotalPages, p + 1))}
                  disabled={currentPage === serverTotalPages}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1 font-semibold"
                >
                  Next <FiChevronRight size={14} />
                </button>
                <button
                  onClick={() => setCurrentPage(serverTotalPages)}
                  disabled={currentPage === serverTotalPages}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 font-semibold"
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
