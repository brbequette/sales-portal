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
  FiChevronRight,
  FiZap,
  FiShoppingBag
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
  description?: string | null
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
  lineItems?: Array<{ sku: string; name?: string; quantity: number }>
}

function formatAddressString(addr: any): string | null {
  if (!addr) return null
  if (typeof addr === "string") {
    const trimmed = addr.trim()
    if (!trimmed) return null
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed && typeof parsed === "object") {
          return formatAddressString(parsed)
        }
      } catch {
        // Fall back to trimmed string
      }
    }
    return trimmed
  }
  if (typeof addr === "object") {
    const parts = [
      addr.attention || "",
      addr.address || addr.street || addr.address1 || addr.street1 || "",
      addr.street2 || addr.address2 || "",
      addr.city || "",
      addr.state || "",
      addr.zip || addr.zipcode || addr.zip_code || "",
      addr.country || ""
    ]
      .map(p => (typeof p === "string" || typeof p === "number" ? String(p).trim() : ""))
      .filter(Boolean)
    return parts.join(", ") || null
  }
  return String(addr)
}

function safeText(val: any, fallback = ""): string {
  if (val === null || val === undefined) return fallback
  if (typeof val === "string") {
    const trimmed = val.trim()
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed && typeof parsed === "object") {
          return formatAddressString(parsed) || fallback
        }
      } catch {}
    }
    return val
  }
  if (typeof val === "number") return String(val)
  if (typeof val === "object") return formatAddressString(val) || fallback
  return String(val)
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
        <label className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <FiSearch className="text-blue-400 text-sm" /> Live Sales Document Search
        </label>
        {searching && <span className="text-xs text-blue-400 font-semibold animate-pulse">Searching catalog...</span>}
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Invoice #, SO #, Estimate #, Customer, Street Address, Ref #, SKU..."
          className="w-full bg-slate-950/90 border border-slate-800 focus:border-blue-500 rounded-xl py-2.5 px-3.5 pl-10 text-xs text-white placeholder-slate-500 outline-none transition shadow-inner"
        />
        <FiSearch className="absolute left-3.5 top-3 text-slate-500" size={14} />
      </div>

      <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {results.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/80">
            {searching ? "Searching sales documents..." : "No matching documents found. Try adjusting your query."}
          </div>
        ) : (
          results.map((inv) => {
            const dType = inv.docType || "Invoice"
            const dNum = inv.docNumber || inv.invoiceNumber
            const typeLabel = dType === "SalesOrder" ? "SO" : dType === "Estimate" ? "Est" : "Inv"
            const badgeBg = dType === "SalesOrder"
              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
              : dType === "Estimate"
              ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
              : "bg-blue-500/20 text-blue-300 border-blue-500/40"

            const shipToText = formatAddressString(inv.shipTo)

            return (
              <div
                key={inv.id}
                className="bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-blue-500/50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition shadow-sm"
              >
                <div className="min-w-0 flex-1 text-xs space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${badgeBg}`}>
                      {typeLabel} #{dNum}
                    </span>
                    <span className="text-xs font-bold text-white truncate max-w-[220px]">
                      {safeText(inv.customerName, "Unknown Customer")}
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                      ${inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {inv.status && (
                      <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                        {safeText(inv.status)}
                      </span>
                    )}
                  </div>
                  {(inv.referenceNumber || inv.issueDate || shipToText) && (
                    <div className="text-[11px] text-slate-400 flex items-center gap-3 mt-1 flex-wrap">
                      {inv.issueDate && <span>Date: {new Date(inv.issueDate).toLocaleDateString()}</span>}
                      {inv.referenceNumber && <span>Ref: {safeText(inv.referenceNumber)}</span>}
                      {shipToText && <span className="truncate max-w-[200px]">Ship: {shipToText}</span>}
                    </div>
                  )}
                  {inv.lineItems && inv.lineItems.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pt-1.5 border-t border-slate-800/60">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Invoice Items:</span>
                      {inv.lineItems.map((item, iIdx) => (
                        <span key={iIdx} className="text-[10px] font-mono font-bold bg-slate-950 text-blue-300 px-1.5 py-0.5 rounded border border-slate-800">
                          {item.quantity}x {item.sku || item.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onViewDoc({ zohoId: inv.zohoId, docNumber: dNum, type: dType === "SalesOrder" ? "SalesOrder" : dType === "Estimate" ? "Quote" : "Invoice" })}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-1.5"
                    title="Review document in popup modal"
                  >
                    <FiEye size={13} /> Review
                  </button>
                  <button
                    onClick={() => handleExecuteLink(dNum)}
                    disabled={linkingInv === dNum}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition flex items-center gap-1.5 disabled:opacity-50 shadow-md"
                  >
                    <FiLink size={13} />
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
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
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

  const fetchSuggestions = async (recordIds?: string, type: "po" | "payment" = "po") => {
    setSuggestionsLoading(true)
    try {
      const paramName = type === "po" ? "poIds" : "paymentIds"
      const url = recordIds ? `/api/admin/orphans/suggest-matches?type=${type}&${paramName}=${encodeURIComponent(recordIds)}` : `/api/admin/orphans/suggest-matches?type=${type}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        if (data.suggestions) {
          setSuggestions(prev => ({ ...prev, ...data.suggestions }))
        }
        if (data.autoApprovedCount && data.autoApprovedCount > 0) {
          setSyncMessage(`Auto-approved and linked ${data.autoApprovedCount} 85%+ matched ${type === "po" ? "Purchase Order(s)" : "Payment(s)"}!`)
          setTimeout(() => setSyncMessage(""), 5000)
          fetchData()
        }
      }
    } catch (e) {
      console.error("Error fetching match suggestions:", e)
    } finally {
      setSuggestionsLoading(false)
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

        // Fetch match suggestions ONLY for the records on the current page for lightning speed
        if (activeTab === "pos" && data.purchaseOrders && data.purchaseOrders.length > 0) {
          const pagePoIds = data.purchaseOrders.map((p: any) => p.zohoId).join(",")
          fetchSuggestions(pagePoIds, "po")
        } else if (activeTab === "payments" && data.payments && data.payments.length > 0) {
          const pagePaymentIds = data.payments.map((p: any) => p.zohoId).join(",")
          fetchSuggestions(pagePaymentIds, "payment")
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
    setSyncMessage(activeTab === "pos" ? "Scanning unassociated POs against Invoices, Sales Orders & Estimates for matches..." : "Scanning unassociated Payments against Invoices (Grand Total & Customer matching)...")
    try {
      // Step 1: Immediately link all confident (85%+) matches already verified on the active page
      const pageConfidentItems: Array<{ id: string; invNum: string }> = []
      if (activeTab === "pos") {
        for (const po of pos) {
          const s = suggestions[po.zohoId] || suggestions[po.id] || (po.poNumber ? suggestions[po.poNumber] : null)
          const top = s?.bestMatch || (s?.score ? s : null)
          if (top && top.score >= 85) {
            const invNum = top.docNumber || top.invoiceNumber
            if (invNum) pageConfidentItems.push({ id: po.zohoId, invNum: String(invNum) })
          }
        }
      } else {
        for (const p of payments) {
          const s = suggestions[p.zohoId] || suggestions[p.id]
          const top = s?.bestMatch || (s?.score ? s : null)
          if (top && top.score >= 85) {
            const invNum = top.docNumber || top.invoiceNumber
            if (invNum) pageConfidentItems.push({ id: p.zohoId, invNum: String(invNum) })
          }
        }
      }

      let clientLinked = 0
      if (pageConfidentItems.length > 0) {
        setSyncMessage(`Linking ${pageConfidentItems.length} verified confident matches on this page...`)
        for (const item of pageConfidentItems) {
          try {
            const lRes = await fetch("/api/admin/orphans/link", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: activeTab === "pos" ? "po" : "payment", id: item.id, invoiceNumber: item.invNum })
            })
            const lData = await lRes.json().catch(() => null)
            if (lData?.success) {
              clientLinked++
              if (activeTab === "pos") {
                setPOs(prev => prev.filter(p => p.zohoId !== item.id && p.id !== item.id))
              } else {
                setPayments(prev => prev.filter(p => p.zohoId !== item.id && p.id !== item.id))
              }
            }
          } catch (e) {
            console.error("Quick link error:", e)
          }
        }
      }

      // Step 2: Auto-match remaining records across the database in bounded batches
      let serverLinkedTotal = 0
      let hasMore = true
      let batch = 1
      const maxBatches = 5

      while (hasMore && batch <= maxBatches) {
        setSyncMessage(`Scanning and auto-linking database records (batch ${batch} of ${maxBatches})...`)
        try {
          const res = await fetch(`/api/admin/orphans/auto-match?type=${activeTab}&limit=35`, { method: "POST" })
          const data = await res.json().catch(() => null)

          if (!res.ok || !data || !data.success) {
            console.warn("Auto-match batch notice:", data?.error || res?.statusText || "Server error")
            break
          }

          const batchLinked = Number(data.linkedCount || 0)
          serverLinkedTotal += batchLinked
          hasMore = Boolean(data.hasMore && batchLinked > 0)
          batch++
        } catch (err: any) {
          console.warn("Auto-match batch error:", err)
          break
        }
      }

      const totalLinked = clientLinked + serverLinkedTotal
      if (totalLinked > 0) {
        setSyncMessage(`Auto-match complete! Successfully linked and cleared ${totalLinked} records.`)
      } else {
        setSyncMessage("Auto-match scan complete. No new high-probability matches met the 85%+ threshold.")
      }
      fetchData()
      setTimeout(() => setSyncMessage(""), 6000)
    } catch (e: any) {
      setSyncMessage(`Auto-match notice: ${e.message || "Unknown error"}`)
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

  const confidentPageMatchesCount = useMemo(() => {
    if (activeTab === "pos") {
      return pos.filter(po => {
        const s = suggestions[po.zohoId] || suggestions[po.id] || (po.poNumber ? suggestions[po.poNumber] : null)
        const top = s?.bestMatch || (s?.score ? s : null)
        return top && top.score >= 85
      }).length
    } else {
      return payments.filter(p => {
        const s = suggestions[p.zohoId] || suggestions[p.id]
        const top = s?.bestMatch || (s?.score ? s : null)
        return top && top.score >= 85
      }).length
    }
  }, [pos, payments, suggestions, activeTab])

  const handleLinkAllPageConfident = async () => {
    setIsLinking(true)
    setSyncMessage("Linking all high-probability matches on this page...")
    try {
      const confidentItems: Array<{ id: string; invNum: string }> = []
      if (activeTab === "pos") {
        for (const po of pos) {
          const s = suggestions[po.zohoId] || suggestions[po.id] || (po.poNumber ? suggestions[po.poNumber] : null)
          const top = s?.bestMatch || (s?.score ? s : null)
          if (top && top.score >= 85) {
            const invNum = top.docNumber || top.invoiceNumber
            if (invNum) confidentItems.push({ id: po.zohoId, invNum: String(invNum) })
          }
        }
      } else {
        for (const p of payments) {
          const s = suggestions[p.zohoId] || suggestions[p.id]
          const top = s?.bestMatch || (s?.score ? s : null)
          if (top && top.score >= 85) {
            const invNum = top.docNumber || top.invoiceNumber
            if (invNum) confidentItems.push({ id: p.zohoId, invNum: String(invNum) })
          }
        }
      }

      if (confidentItems.length === 0) {
        setSyncMessage("No 85%+ confident matches found on this page.")
        setTimeout(() => setSyncMessage(""), 3000)
        return
      }

      let successCount = 0
      for (const item of confidentItems) {
        try {
          const res = await fetch("/api/admin/orphans/link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: activeTab === "pos" ? "po" : "payment",
              id: item.id,
              invoiceNumber: item.invNum
            })
          })
          const data = await res.json()
          if (data.success) successCount++
        } catch (e) {
          console.error("Link error:", e)
        }
      }

      setSyncMessage(`Successfully linked and cleared ${successCount} high-probability matches from this page!`)
      fetchData()
      setTimeout(() => setSyncMessage(""), 5000)
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
    <div className="page-content bg-slate-950 text-slate-100 min-h-screen">
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
      <div className="page-header border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl px-6 py-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/30 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/5">
            <FiPackage className="text-red-400" size={20} />
          </div>
          <div>
            <h1 className="page-title text-xl font-black tracking-tight text-white flex items-center gap-2">
              Orphaned Files Manager
            </h1>
            <p className="page-subtitle text-xs text-slate-400 font-medium mt-0.5">
              Automated smart-linking of Purchase Orders & Payments to Invoices, Sales Orders & Estimates
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAutoMatch}
            disabled={autoMatching}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <FiZap size={14} className={autoMatching ? "animate-spin" : ""} />
            {autoMatching ? "Matching..." : activeTab === "pos" ? "Auto-Link Confident Matches" : "Auto-Link Confident Payments"}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-750 font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <FiRefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync POs & Payments"}
          </button>
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div className="page-body p-6 space-y-6 max-w-[1600px] mx-auto w-full">

        {/* Sync Progress Banner */}
        {syncMessage && (
          <div className="bg-blue-950/40 border border-blue-500/40 rounded-2xl p-4 text-blue-200 flex items-center gap-3 shadow-lg animate-pulse">
            <FiRefreshCw className="animate-spin text-xl text-blue-400 flex-shrink-0" />
            <span className="text-xs font-semibold tracking-wide">{syncMessage}</span>
          </div>
        )}

        {/* KPI Status Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between shadow-xl relative overflow-hidden group hover:border-red-500/40 transition">
            <div className="flex items-center gap-4">
              <div className="p-3.5 bg-red-500/15 text-red-400 border border-red-500/30 rounded-2xl shadow-inner">
                <FiPackage className="text-2xl" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Unassociated Purchase Orders</div>
                <div className="text-3xl font-black text-white mt-1 tracking-tight">{poCount.toLocaleString()}</div>
              </div>
            </div>
            <div className="hidden sm:block text-right text-xs text-slate-500 font-mono">
              Ready for 1-to-1 matching
            </div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between shadow-xl relative overflow-hidden group hover:border-amber-500/40 transition">
            <div className="flex items-center gap-4">
              <div className="p-3.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-2xl shadow-inner">
                <FiDollarSign className="text-2xl" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Unassociated Payments</div>
                <div className="text-3xl font-black text-white mt-1 tracking-tight">{paymentCount.toLocaleString()}</div>
              </div>
            </div>
            <div className="hidden sm:block text-right text-xs text-slate-500 font-mono">
              Offline / Unallocated
            </div>
          </div>
        </div>

        {/* Main Tabs Navigation */}
        <div className="border-b border-slate-800/80 flex items-center gap-8">
          <button
            onClick={() => handleTabChange("pos")}
            className={`pb-3.5 text-sm font-extrabold transition flex items-center gap-2.5 cursor-pointer ${
              activeTab === "pos"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <FiPackage size={16} />
            <span>Unassociated POs</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === "pos" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "bg-slate-800 text-slate-400"}`}>
              {poCount}
            </span>
          </button>
          <button
            onClick={() => handleTabChange("payments")}
            className={`pb-3.5 text-sm font-extrabold transition flex items-center gap-2.5 cursor-pointer ${
              activeTab === "payments"
                ? "text-amber-400 border-b-2 border-amber-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <FiDollarSign size={16} />
            <span>Unassociated Payments</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === "payments" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-slate-800 text-slate-400"}`}>
              {paymentCount}
            </span>
          </button>
        </div>

        {/* Manual Linking Modal Box */}
        {linkingRecordId && (
          <div className="bg-slate-900/95 backdrop-blur-xl border border-blue-500/40 rounded-2xl p-6 shadow-2xl animate-in fade-in duration-200">
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <FiLink className="text-blue-400" />
              Link {linkingType === "po" ? "Purchase Order" : "Payment"} directly to Sales Document
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter the exact Invoice #, Sales Order #, or Estimate # to link (e.g. 10985 or SO-25410).
            </p>
            <form onSubmit={handleLink} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={invoiceInput}
                onChange={(e) => setInvoiceInput(e.target.value)}
                placeholder="Invoice Number, Sales Order Number, or Estimate Number"
                className="bg-slate-950 border border-slate-750 focus:border-blue-500 rounded-xl py-2.5 px-4 text-xs text-white outline-none flex-grow"
                required
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isLinking}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition flex items-center gap-2 cursor-pointer shadow-md"
                >
                  {isLinking ? "Linking..." : "Execute Link"}
                </button>
                <button
                  type="button"
                  onClick={() => { setLinkingRecordId(null); setLinkingType(null); }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
            {linkError && <p className="text-red-400 text-xs mt-2.5 font-semibold">{linkError}</p>}
            {linkSuccess && <p className="text-emerald-400 text-xs mt-2.5 font-semibold flex items-center gap-1.5"><FiCheckCircle /> {linkSuccess}</p>}
          </div>
        )}

        {/* Responsive Table Workspace Container */}
        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl">
          {/* Controls Bar */}
          {!loading && (
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 bg-slate-950/60 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                <div className="relative flex-1 min-w-[260px]">
                  <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    value={tableSearch}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    placeholder={activeTab === "pos" ? "Search PO #, vendor, customer, address, or SO #..." : "Search payment #, customer, mode, or ref #..."}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/80 py-2 pl-10 pr-4 text-xs text-white outline-none focus:border-blue-500 transition"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Filter by date availability"
                    value={dateFilter}
                    onChange={(event) => handleDateFilterChange(event.target.value as typeof dateFilter)}
                    className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-300 outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="all">All Dates</option>
                    <option value="dated">Has Date</option>
                    <option value="missing">Missing Date</option>
                  </select>
                  <select
                    aria-label="Sort orphaned records"
                    value={tableSort}
                    onChange={(event) => handleSortChange(event.target.value as typeof tableSort)}
                    className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-300 outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="date-desc">Newest Date</option>
                    <option value="date-asc">Oldest Date</option>
                    <option value="amount-desc">Highest Amount</option>
                    <option value="amount-asc">Lowest Amount</option>
                    <option value="name-asc">Name A–Z</option>
                  </select>
                </div>
              </div>

              {/* Per Page Selector & Record Count Counter */}
              <div className="flex items-center justify-between sm:justify-end gap-3 text-xs flex-wrap">
                {confidentPageMatchesCount > 0 && (
                  <button
                    onClick={handleLinkAllPageConfident}
                    disabled={isLinking}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-3 py-1.5 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer animate-pulse"
                    title="Clear off all high-confidence (85%+) matches currently visible on this page"
                  >
                    <FiCheckCircle size={14} />
                    <span>Link & Clear {confidentPageMatchesCount} Page Matches</span>
                  </button>
                )}
                <div className="flex items-center gap-2 text-slate-400 font-medium">
                  <span>Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-white text-xs font-bold outline-none focus:border-blue-500"
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

          {/* Table Content */}
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
              <FiRefreshCw className="animate-spin text-4xl text-blue-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Loading Orphaned Catalog...</span>
            </div>
          ) : activeTab === "pos" ? (
            pos.length === 0 ? (
              <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3 text-center">
                <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400 text-2xl shadow-lg">
                  <FiCheckCircle />
                </div>
                <span className="font-bold text-lg text-white">No Orphaned Purchase Orders Found</span>
                <span className="text-xs text-slate-400 max-w-md">All Purchase Orders are linked to sales documents or marked as inventory stock.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 sticky top-0 backdrop-blur-md z-10">
                    <tr>
                      <th className="w-12 px-3 py-3.5 text-center"></th>
                      <th className="w-44 px-4 py-3.5 text-left">PO Number</th>
                      <th className="w-[270px] px-4 py-3.5 text-left">Suggested Match</th>
                      <th className="min-w-[220px] px-4 py-3.5 text-left">Vendor & Ship-To Target</th>
                      <th className="w-32 px-4 py-3.5 text-left">Date</th>
                      <th className="w-32 px-4 py-3.5 text-left">Total</th>
                      <th className="w-36 px-4 py-3.5 text-left">Linked SO</th>
                      <th className="w-48 px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {pos.map((po) => {
                      const isExpanded = expandedRowId === po.zohoId
                      const displayPO = getDisplayPONumber(po)
                      const targetSO = po.salesOrderNumber || po.referenceNumber
                      const poSuggestions = suggestions[po.zohoId] || suggestions[po.id] || (po.poNumber ? suggestions[po.poNumber] : null)
                      const topMatch = poSuggestions?.bestMatch || (poSuggestions?.score ? poSuggestions : null)
                      const candidatesList: any[] = poSuggestions?.candidates || (topMatch ? [topMatch] : [])

                      const displayShipName = safeText(
                        po.shipToName ||
                        po.items?.delivery_customer_name ||
                        po.items?.customer_name ||
                        po.items?.delivery_address?.attention ||
                        po.items?.shipping_address?.attention
                      )
                      const displayShipAddr = formatAddressString(
                        po.shippingAddress ||
                        po.items?.delivery_address ||
                        po.items?.shipping_address ||
                        po.items?.recipient_address
                      )

                      return (
                        <Fragment key={po.id}>
                          <tr
                            className={`transition hover:bg-slate-850/50 cursor-pointer ${isExpanded ? "bg-slate-900/90" : ""}`}
                            onClick={() => setExpandedRowId(isExpanded ? null : po.zohoId)}
                          >
                            <td className="w-12 px-3 py-4 text-center">
                              <button
                                type="button"
                                aria-label="Expand row details"
                                onClick={(e) => { e.stopPropagation(); setExpandedRowId(isExpanded ? null : po.zohoId); }}
                                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                              >
                                {isExpanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                              </button>
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-extrabold text-white tracking-tight">{displayPO}</span>
                                {po.isDropshipment && (
                                  <span className="text-[9px] uppercase font-black bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded">
                                    Dropship
                                  </span>
                                )}
                              </div>
                              {displayPO !== po.zohoId && (
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                  ID: {po.zohoId}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                              {topMatch ? (
                                <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-2.5 space-y-1.5 shadow-sm">
                                  <div className="flex items-center justify-between gap-1 flex-wrap">
                                    <span className="text-[10px] font-black uppercase text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                                      {topMatch.docType || 'Inv'} #{topMatch.docNumber || topMatch.invoiceNumber}
                                    </span>
                                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                      🎯 {topMatch.score}% Match
                                    </span>
                                  </div>
                                  <div className="text-xs text-white font-bold truncate max-w-[210px]" title={safeText(topMatch.customerName)}>
                                    {safeText(topMatch.customerName, "Unknown Customer")}
                                  </div>
                                  {topMatch.lineItems && topMatch.lineItems.length > 0 && (
                                    <div className="text-[10px] text-emerald-300 font-mono truncate max-w-[210px] mt-0.5" title={topMatch.lineItems.map((i: any) => `${i.quantity}x ${i.sku || i.name}`).join(', ')}>
                                      Items: {topMatch.lineItems.map((i: any) => `${i.quantity}x ${i.sku || i.name}`).join(', ')}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 pt-0.5">
                                    <button
                                      onClick={() => setSelectedSalesDoc({
                                        zohoId: topMatch.docId || topMatch.invoiceId,
                                        docNumber: topMatch.docNumber || topMatch.invoiceNumber,
                                        type: (topMatch.docType as any) || "Invoice"
                                      })}
                                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-2 py-1 rounded-lg text-[10px] transition flex items-center gap-1 cursor-pointer"
                                      title="Review document details"
                                    >
                                      <FiEye size={11} /> Review
                                    </button>
                                    <button
                                      onClick={() => handleQuickLink(po.zohoId, topMatch.docNumber || topMatch.invoiceNumber)}
                                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-2.5 py-1 rounded-lg text-[10px] transition flex items-center gap-1 cursor-pointer shadow-md"
                                    >
                                      <FiLink size={11} /> Link Now
                                    </button>
                                  </div>
                                </div>
                              ) : suggestionsLoading ? (
                                <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium animate-pulse">
                                  <FiRefreshCw className="animate-spin text-xs" />
                                  <span>Analyzing matches...</span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500 italic">No match suggested</span>
                              )}
                            </td>

                            <td className="px-4 py-4 max-w-xs">
                              <div className="font-bold text-slate-200 truncate">{safeText(po.vendorName, "Unknown Vendor")}</div>
                              {(displayShipName || displayShipAddr) && (
                                <div className="text-[11px] text-blue-300 font-medium truncate mt-0.5 flex items-center gap-1.5" title={`${displayShipName || ''} ${displayShipAddr || ''}`.trim()}>
                                  <FiMapPin size={12} className="text-blue-400 flex-shrink-0" />
                                  <span className="truncate">
                                    {displayShipName ? `To: ${displayShipName}` : ''}
                                    {displayShipName && displayShipAddr ? ' — ' : ''}
                                    {displayShipAddr || ''}
                                  </span>
                                </div>
                              )}
                              {(() => {
                                const rowItems = (Array.isArray(po.items) ? po.items : (po.items?.lineItems || po.items?.line_items)) || []
                                if (rowItems.length === 0) return null
                                return (
                                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    <span className="text-[10px] uppercase font-black text-amber-400 flex items-center gap-1">
                                      <FiShoppingBag size={10} /> PO Items:
                                    </span>
                                    {rowItems.slice(0, 3).map((it: any, iIdx: number) => (
                                      <span key={iIdx} className="text-[10px] font-mono font-bold bg-slate-900 text-amber-300 px-1.5 py-0.5 rounded border border-slate-800">
                                        {it.quantity}x {safeText(it.sku || it.name)}
                                      </span>
                                    ))}
                                    {rowItems.length > 3 && (
                                      <span className="text-[10px] font-mono text-slate-500">
                                        +{rowItems.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                )
                              })()}
                            </td>

                            <td className="px-4 py-4 text-slate-400 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <FiCalendar size={13} className="text-slate-500" />
                                <span>{po.date ? new Date(po.date).toLocaleDateString() : "N/A"}</span>
                              </div>
                            </td>

                            <td className="px-4 py-4 font-black text-emerald-400 whitespace-nowrap">
                              ${po.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>

                            <td className="px-4 py-4 text-slate-400" onClick={(e) => e.stopPropagation()}>
                              {targetSO ? (
                                <button
                                  onClick={() => setSelectedSalesDoc({ zohoId: po.salesOrderId || targetSO, docNumber: targetSO, type: "SalesOrder" })}
                                  className="inline-flex items-center gap-1.5 font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-2.5 py-1 rounded-lg transition text-xs cursor-pointer group whitespace-nowrap shadow-sm"
                                  title="Click to review Sales Order"
                                >
                                  <span>SO #{targetSO}</span>
                                  <FiExternalLink size={12} className="group-hover:translate-x-0.5 transition-transform" />
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500 italic">No Sales Order</span>
                              )}
                              {po.referenceNumber && po.referenceNumber !== targetSO && (
                                <div className="text-[10px] text-amber-400 font-mono mt-1">
                                  Ref: {po.referenceNumber}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end items-center gap-1.5">
                                <button
                                  onClick={() => setExpandedRowId(isExpanded ? null : po.zohoId)}
                                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 whitespace-nowrap cursor-pointer"
                                >
                                  {isExpanded ? "Collapse" : "Find Match"}
                                </button>
                                <button
                                  onClick={() => { setLinkingRecordId(po.zohoId); setLinkingType("po"); }}
                                  className="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 whitespace-nowrap cursor-pointer"
                                >
                                  <FiLink size={12} /> Tie
                                </button>
                                <button
                                  onClick={() => handleMarkInventory(po.zohoId)}
                                  className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white p-2 rounded-lg text-xs transition cursor-pointer"
                                  title="Mark Inventory Stock"
                                >
                                  <FiArchive size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* ─── Expanded Match Workspace Drawer ─────────────────── */}
                          {isExpanded && (
                            <tr key={`${po.id}-expanded`} className="bg-slate-950">
                              <td colSpan={8} className="p-0 border-b border-slate-800">
                                <div className="border-t border-b border-blue-500/30 bg-slate-950/95 p-6 shadow-2xl animate-in fade-in duration-200">
                                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                                    {/* Left Pane: PO Record Dossier */}
                                    <div className="lg:col-span-5 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-800/80 pb-6 lg:pb-0 lg:pr-6">
                                      <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                                          <FiPackage className="text-blue-400 text-sm" />
                                          Purchase Order Dossier
                                        </h3>
                                        <span className="text-xs font-mono font-bold text-slate-300 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
                                          PO #{displayPO}
                                        </span>
                                      </div>

                                      {/* Context Tip Box */}
                                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 space-y-1.5">
                                        <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                          <FiInfo size={14} /> Historical Reference Context
                                        </div>
                                        <div className="text-xs text-slate-200 font-mono font-semibold">
                                          Ref / SO Number: {po.referenceNumber || po.salesOrderNumber || "None specified"}
                                        </div>
                                        <p className="text-[11px] text-slate-300 leading-relaxed">
                                          Historical orders prior to 2026 often transitioned directly from Estimate → Invoice. Candidate engine matches customer accounts, dropship addresses, SKU line items, dates & cost totals.
                                        </p>
                                      </div>

                                      {/* PO Metadata Grid */}
                                      <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                                          <div className="text-slate-400 font-medium">Vendor Name</div>
                                          <div className="text-white font-bold mt-0.5 truncate">{safeText(po.vendorName, "Unknown Vendor")}</div>
                                        </div>
                                        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                                          <div className="text-slate-400 font-medium">PO Total</div>
                                          <div className="text-emerald-400 font-extrabold mt-0.5">${po.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        </div>

                                        {/* Shipping Target */}
                                        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 col-span-2 space-y-1">
                                          <div className="text-slate-400 font-bold text-xs flex items-center gap-1.5">
                                            <FiMapPin size={13} className="text-blue-400" /> Dropship Target & Shipping Address
                                          </div>
                                          <div className="text-white font-bold text-xs">
                                            {displayShipName || "Customer / Recipient Not Specified"}
                                          </div>
                                          {displayShipAddr ? (
                                            <div className="text-[11px] text-slate-300 mt-1 leading-normal font-mono bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                                              {displayShipAddr}
                                            </div>
                                          ) : (
                                            <div className="text-[11px] text-slate-500 italic mt-0.5">
                                              No street address recorded. Auto-matcher scans customer account profiles.
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Items Ordered on PO */}
                                       {(() => {
                                         const poItemsRaw = (Array.isArray(po.items) ? po.items : (po.items?.lineItems || po.items?.line_items)) || []
                                         const candidateSkus = new Set(
                                           candidatesList.flatMap(c => (c.lineItems || []).map((li: any) => String(li.sku || li.name || '').trim().toUpperCase()))
                                         )

                                         return (
                                           <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                                             <div className="flex items-center justify-between">
                                               <div className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                                                 <FiShoppingBag className="text-amber-400" /> Items Ordered on PO ({poItemsRaw.length})
                                               </div>
                                               {poItemsRaw.length > 0 && (
                                                 <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                                                   {poItemsRaw.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0)} Total Units
                                                 </span>
                                               )}
                                             </div>

                                             {poItemsRaw.length === 0 ? (
                                               <div className="text-[11px] text-slate-500 italic py-2 text-center bg-slate-950/60 rounded-lg border border-slate-800/80">
                                                 No line items recorded on this Purchase Order.
                                               </div>
                                             ) : (
                                               <div className="space-y-2">
                                                 {/* Quick-compare SKU Pills */}
                                                 <div className="flex flex-wrap gap-1.5 pb-1">
                                                   {poItemsRaw.map((item: any, idx: number) => {
                                                     const itemSku = String(item.sku || item.name || '').trim().toUpperCase()
                                                     const isMatched = candidateSkus.has(itemSku)
                                                     return (
                                                       <span
                                                         key={idx}
                                                         className={`text-[11px] font-mono font-bold px-2 py-1 rounded-lg border flex items-center gap-1.5 transition ${
                                                           isMatched
                                                             ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 ring-1 ring-emerald-500/30 shadow-md shadow-emerald-950/40"
                                                             : "bg-slate-950 text-amber-300 border-amber-500/30"
                                                         }`}
                                                         title={item.name ? `${item.name} (${item.description || ''})` : item.sku}
                                                       >
                                                         <span className="text-white font-extrabold">{item.quantity || 1}x</span>
                                                         <span>{item.sku || item.name}</span>
                                                         {item.rate ? <span className="text-slate-400 font-normal">(${Number(item.rate).toFixed(2)})</span> : null}
                                                         {isMatched && <span className="text-emerald-400 font-sans text-[10px] font-black">✓ Match</span>}
                                                       </span>
                                                     )
                                                   })}
                                                 </div>

                                                 {/* Detailed item list */}
                                                 <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                                                   {poItemsRaw.map((item: any, idx: number) => {
                                                     const itemSku = String(item.sku || item.name || '').trim().toUpperCase()
                                                     const isMatched = candidateSkus.has(itemSku)
                                                     return (
                                                       <div
                                                         key={idx}
                                                         className={`p-2 rounded-lg border flex items-center justify-between gap-3 text-xs transition ${
                                                           isMatched
                                                             ? "bg-emerald-950/30 border-emerald-500/40"
                                                             : "bg-slate-950/70 border-slate-800/80"
                                                         }`}
                                                       >
                                                         <div className="min-w-0 flex-1">
                                                           <div className="font-bold text-white flex items-center gap-1.5 truncate">
                                                             <span className="text-amber-400 font-mono font-black">{item.quantity || 1}x</span>
                                                             <span className="truncate">{item.sku || item.name}</span>
                                                             {isMatched && (
                                                               <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded text-[10px] font-black uppercase">
                                                                 Candidate Match
                                                               </span>
                                                             )}
                                                           </div>
                                                           {item.name && item.name !== item.sku && (
                                                             <div className="text-[11px] text-slate-400 truncate">{item.name}</div>
                                                           )}
                                                         </div>
                                                         <div className="text-right flex-shrink-0 font-mono">
                                                           <div className="text-emerald-400 font-extrabold">
                                                             ${(Number(item.item_total || (Number(item.quantity) * Number(item.rate)) || 0)).toFixed(2)}
                                                           </div>
                                                           {item.rate ? (
                                                             <div className="text-[10px] text-slate-500">${Number(item.rate).toFixed(2)}/ea</div>
                                                           ) : null}
                                                         </div>
                                                       </div>
                                                     )
                                                   })}
                                                 </div>
                                               </div>
                                             )}
                                           </div>
                                         )
                                       })()}
                                     </div>

                                     {/* Right Pane: Candidate Matches & Live Search Workspace */}
                                    <div className="lg:col-span-7 space-y-5">
                                      {candidatesList.length > 0 && (
                                        <div className="space-y-3">
                                          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                                            <span className="flex items-center gap-1.5 text-emerald-400">
                                              <FiLayers /> All Candidate Matches ({candidatesList.length})
                                            </span>
                                            <span className="text-[11px] text-slate-500 font-normal">Ranked by address, SKU items, dates & amounts</span>
                                          </div>

                                          <div className="max-h-80 overflow-y-auto grid grid-cols-1 gap-3 pr-1 custom-scrollbar">
                                            {candidatesList.map((cand, cIdx) => {
                                              const dType = cand.docType || "Invoice"
                                              const dNum = cand.docNumber || cand.invoiceNumber
                                              const badgeStyle = dType === "SalesOrder"
                                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                                : dType === "Estimate"
                                                ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                                                : "bg-blue-500/20 text-blue-300 border-blue-500/40"

                                              return (
                                                <div
                                                  key={cIdx}
                                                  className="bg-slate-900/90 hover:bg-slate-850 border border-emerald-500/40 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md transition"
                                                >
                                                  <div className="space-y-1 min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                      <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border ${badgeStyle}`}>
                                                        {dType} #{dNum}
                                                      </span>
                                                      <span className="text-xs font-bold text-white truncate">{safeText(cand.customerName, "Unknown Customer")}</span>
                                                      <span className="text-[11px] font-black bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/30">
                                                        🎯 {cand.score}% Match
                                                      </span>
                                                    </div>

                                                    <div className="flex items-center gap-4 text-xs text-slate-400">
                                                      <span>Amount: <strong className="text-white">${(cand.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                                      {cand.issueDate && <span>Date: {new Date(cand.issueDate).toLocaleDateString()}</span>}
                                                    </div>

                                                    {/* Candidate Line Items */}
                                                    {cand.lineItems && cand.lineItems.length > 0 && (
                                                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-800/60">
                                                        <span className="text-[10px] uppercase font-bold text-emerald-400">Invoice Items:</span>
                                                        {cand.lineItems.map((item: any, iIdx: number) => (
                                                          <span key={iIdx} className="text-[10px] font-mono font-bold bg-slate-950 text-emerald-300 px-1.5 py-0.5 rounded border border-slate-800">
                                                            {item.quantity}x {item.sku || item.name}
                                                          </span>
                                                        ))}
                                                      </div>
                                                    )}

                                                    {/* Match Reason Breakdown Badges */}
                                                    {cand.reasons && cand.reasons.length > 0 && (
                                                      <div className="flex flex-wrap gap-1.5 pt-1">
                                                        {cand.reasons.map((r: string, rIdx: number) => (
                                                          <span key={rIdx} className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md font-medium">
                                                            ✓ {r}
                                                          </span>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>

                                                  <div className="flex items-center gap-2 flex-shrink-0">
                                                    <button
                                                      onClick={() => setSelectedSalesDoc({ zohoId: cand.docId || cand.invoiceId, docNumber: dNum, type: dType === "SalesOrder" ? "SalesOrder" : dType === "Estimate" ? "Quote" : "Invoice" })}
                                                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-2 rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
                                                      title="Review document in popup modal"
                                                    >
                                                      <FiEye size={13} /> Review
                                                    </button>
                                                    <button
                                                      onClick={() => handleQuickLink(po.zohoId, dNum)}
                                                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-4 py-2 rounded-lg text-xs transition flex items-center gap-1.5 whitespace-nowrap shadow-lg cursor-pointer"
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

                                      {/* Interactive Search Workspace Component */}
                                      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-md">
                                        <ExpandedRowSearch
                                          recordZohoId={po.zohoId}
                                          type="po"
                                          initialQuery={displayShipName || po.referenceNumber || po.salesOrderNumber || displayShipAddr || ""}
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
              <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3 text-center">
                <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400 text-2xl shadow-lg">
                  <FiCheckCircle />
                </div>
                <span className="font-bold text-lg text-white">No Orphaned Payments Found</span>
                <span className="text-xs text-slate-400 max-w-md">All customer payments are associated with active invoices.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 sticky top-0 backdrop-blur-md z-10">
                    <tr>
                      <th className="w-12 px-3 py-3.5 text-center"></th>
                      <th className="w-44 px-4 py-3.5 text-left">Payment ID</th>
                      <th className="w-[270px] px-4 py-3.5 text-left">Suggested Match</th>
                      <th className="min-w-[220px] px-4 py-3.5 text-left">Customer Name</th>
                      <th className="w-32 px-4 py-3.5 text-left">Date</th>
                      <th className="w-32 px-4 py-3.5 text-left">Mode</th>
                      <th className="w-32 px-4 py-3.5 text-left">Amount</th>
                      <th className="w-48 px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {payments.map((p: Payment) => {
                      const isExpanded = expandedRowId === p.zohoId
                      const pSuggestions = suggestions[p.zohoId]
                      const topMatch = pSuggestions?.bestMatch || (pSuggestions?.score ? pSuggestions : null)
                      const candidatesList: any[] = pSuggestions?.candidates || (topMatch ? [topMatch] : [])

                      const displayPaymentCustomer = safeText(
                        p.customerName ||
                        (p.description && p.description.includes("Customer:") ? p.description.split("|")[0].replace(/.*customer:\s*/i, "").trim() : p.description),
                        "N/A"
                      )

                      return (
                        <Fragment key={p.id}>
                          <tr
                            className={`transition hover:bg-slate-850/50 cursor-pointer ${isExpanded ? "bg-slate-900/90" : ""}`}
                            onClick={() => setExpandedRowId(isExpanded ? null : p.zohoId)}
                          >
                            <td className="w-12 px-3 py-4 text-center">
                              <button
                                type="button"
                                aria-label="Expand row details"
                                onClick={(e) => { e.stopPropagation(); setExpandedRowId(isExpanded ? null : p.zohoId); }}
                                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                              >
                                {isExpanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                              </button>
                            </td>
                            <td className="px-4 py-4 font-extrabold text-white">{p.zohoId}</td>

                            <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                              {topMatch ? (
                                <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-2.5 space-y-1.5 shadow-sm">
                                  <div className="flex items-center justify-between gap-1 flex-wrap">
                                    <span className="text-[10px] font-black uppercase text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                                      {topMatch.docType || 'Inv'} #{topMatch.docNumber || topMatch.invoiceNumber}
                                    </span>
                                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                      🎯 {topMatch.score}% Match
                                    </span>
                                  </div>
                                  <div className="text-xs text-white font-bold truncate max-w-[210px]" title={topMatch.customerName}>
                                    {safeText(topMatch.customerName, "Unknown Customer")}
                                  </div>
                                  <div className="flex items-center gap-2 pt-0.5">
                                    <button
                                      onClick={() => setSelectedSalesDoc({
                                        zohoId: topMatch.docId || topMatch.invoiceId,
                                        docNumber: topMatch.docNumber || topMatch.invoiceNumber,
                                        type: (topMatch.docType as any) || "Invoice"
                                      })}
                                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-2 py-1 rounded-lg text-[10px] transition flex items-center gap-1 cursor-pointer"
                                      title="Review document details"
                                    >
                                      <FiEye size={11} /> Review
                                    </button>
                                    <button
                                      onClick={() => handleQuickLink(p.zohoId, topMatch.docNumber || topMatch.invoiceNumber)}
                                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-2.5 py-1 rounded-lg text-[10px] transition flex items-center gap-1 cursor-pointer shadow-md"
                                    >
                                      <FiLink size={11} /> Link Now
                                    </button>
                                  </div>
                                </div>
                              ) : suggestionsLoading ? (
                                <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium animate-pulse">
                                  <FiRefreshCw className="animate-spin text-xs" />
                                  <span>Analyzing matches...</span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500 italic">No match suggested</span>
                              )}
                            </td>

                            <td className="px-4 py-4 font-bold text-slate-200">{displayPaymentCustomer}</td>
                            <td className="px-4 py-4 text-slate-400 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <FiCalendar size={13} className="text-slate-500" />
                                <span>{p.date ? new Date(p.date).toLocaleDateString() : "N/A"}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className="bg-slate-850 border border-slate-750 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300">
                                {p.mode || "Offline"}
                              </span>
                            </td>
                            <td className="px-4 py-4 font-black text-amber-400 whitespace-nowrap">
                              ${p.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end items-center gap-2">
                                <button
                                  onClick={() => setExpandedRowId(isExpanded ? null : p.zohoId)}
                                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                >
                                  {isExpanded ? "Collapse" : "Find Match"}
                                </button>
                                <button
                                  onClick={() => { setLinkingRecordId(p.zohoId); setLinkingType("payment"); }}
                                  className="bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                                >
                                  <FiLink size={12} /> Tie to Invoice
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Payment Drawer */}
                          {isExpanded && (
                            <tr key={`${p.id}-expanded`} className="bg-slate-950">
                              <td colSpan={8} className="p-0 border-b border-slate-800">
                                <div className="border-t border-b border-amber-500/30 bg-slate-950/95 p-6 shadow-2xl animate-in fade-in duration-200">
                                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                    <div className="lg:col-span-5 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-800/80 pb-6 lg:pb-0 lg:pr-6">
                                      <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                                          <FiDollarSign className="text-amber-400 text-sm" />
                                          Payment Record Dossier
                                        </h3>
                                        <span className="text-xs font-mono font-bold text-slate-300 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
                                          ID: {p.zohoId}
                                        </span>
                                      </div>
                                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 space-y-1">
                                        <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                          <FiInfo size={14} /> Pertinent Payment Reference
                                        </div>
                                        <div className="text-xs text-slate-200 font-mono font-semibold">
                                          Reference Number: {p.referenceNumber || "None"}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                                          <div className="text-slate-400 font-medium">Customer Name</div>
                                          <div className="text-white font-bold mt-0.5 truncate">{displayPaymentCustomer}</div>
                                        </div>
                                        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                                          <div className="text-slate-400 font-medium">Payment Amount</div>
                                          <div className="text-amber-400 font-extrabold mt-0.5">${p.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="lg:col-span-7 space-y-5">
                                      {candidatesList.length > 0 && (
                                        <div className="space-y-3">
                                          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                                            <span className="flex items-center gap-1.5 text-emerald-400">
                                              <FiLayers /> All Candidate Invoice Matches ({candidatesList.length})
                                            </span>
                                            <span className="text-[11px] text-slate-500 font-normal">Ranked by Customer Account, Amount & Date</span>
                                          </div>

                                          <div className="max-h-80 overflow-y-auto grid grid-cols-1 gap-3 pr-1 custom-scrollbar">
                                            {candidatesList.map((cand, cIdx) => {
                                              const dType = cand.docType || "Invoice"
                                              const dNum = cand.docNumber || cand.invoiceNumber

                                              return (
                                                <div
                                                  key={cIdx}
                                                  className="bg-slate-900/90 hover:bg-slate-850 border border-emerald-500/40 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md transition"
                                                >
                                                  <div className="space-y-1 min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                      <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border bg-blue-500/20 text-blue-300 border-blue-500/40">
                                                        {dType} #{dNum}
                                                      </span>
                                                      <span className="text-xs font-bold text-white truncate">{safeText(cand.customerName, "Unknown Customer")}</span>
                                                      <span className="text-[11px] font-black bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/30">
                                                        🎯 {cand.score}% Match
                                                      </span>
                                                    </div>

                                                    <div className="flex items-center gap-4 text-xs text-slate-400">
                                                      <span>Invoice Total: <strong className="text-white">${(cand.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                                      {cand.issueDate && <span>Date: {new Date(cand.issueDate).toLocaleDateString()}</span>}
                                                    </div>

                                                    {cand.reasons && cand.reasons.length > 0 && (
                                                      <div className="flex flex-wrap gap-1.5 pt-1">
                                                        {cand.reasons.map((r: string, rIdx: number) => (
                                                          <span key={rIdx} className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md font-medium">
                                                            ✓ {r}
                                                          </span>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>

                                                  <div className="flex items-center gap-2 flex-shrink-0">
                                                    <button
                                                      onClick={() => setSelectedSalesDoc({ zohoId: cand.docId || cand.invoiceId, docNumber: dNum, type: "Invoice" })}
                                                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-2 rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
                                                      title="Review document in popup modal"
                                                    >
                                                      <FiEye size={13} /> Review
                                                    </button>
                                                    <button
                                                      onClick={() => handleQuickLink(p.zohoId, dNum)}
                                                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-4 py-2 rounded-lg text-xs transition flex items-center gap-1.5 whitespace-nowrap shadow-lg cursor-pointer"
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

                                      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-md">
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
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-800/80 bg-slate-950/80 text-xs">
              <div className="text-slate-400 font-medium">
                Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{serverTotalPages}</strong>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 font-bold transition cursor-pointer"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1 font-bold transition cursor-pointer"
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
                        className={`w-8 h-8 rounded-xl text-xs font-black transition cursor-pointer ${
                          currentPage === pageNum
                            ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
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
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1 font-bold transition cursor-pointer"
                >
                  Next <FiChevronRight size={14} />
                </button>
                <button
                  onClick={() => setCurrentPage(serverTotalPages)}
                  disabled={currentPage === serverTotalPages}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 font-bold transition cursor-pointer"
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
