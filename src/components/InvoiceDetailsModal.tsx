"use client"


import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { FiFileText, FiDatabase, FiRefreshCw, FiBox, FiTruck, FiDownload, FiMail, FiDollarSign, FiXCircle, FiCheckCircle, FiSlash, FiSend, FiCheck, FiCpu, FiChevronLeft, FiChevronRight, FiCheckSquare, FiExternalLink } from "react-icons/fi"
import { CreatePackageModal } from "./CreatePackageModal"
import { CreateDropshipmentModal } from "./CreateDropshipmentModal"
import { RecordPaymentModal } from "./RecordPaymentModal"
import { DocumentLifecycle } from "./DocumentLifecycle"
import { SaleCommunications } from "./SaleCommunications"
import { DocumentTasks } from "./DocumentTasks"
import { InvoiceFinancialBreakdown } from "./InvoiceFinancialBreakdown"
import { isItemExemptFromVig } from "@/lib/custom-field-extractor"


interface InvoiceDetailsModalProps {
  invoice: any | string; // Can be an invoice object or just the zohoId string
  type?: "Quote" | "SalesOrder" | "Invoice";
  onClose: () => void;
  // Optional navigation -- pass the full list and current index to enable prev/next
  invoiceList?: any[];
  currentIndex?: number;
  onNavigate?: (index: number) => void;
}

export function InvoiceDetailsModal({ invoice, type = "Invoice", onClose, invoiceList, currentIndex, onNavigate }: InvoiceDetailsModalProps) {
  const [internalInvoiceOverride, setInternalInvoiceOverride] = useState<any | null>(null)
  const [internalTypeOverride, setInternalTypeOverride] = useState<"Quote" | "SalesOrder" | "Invoice" | null>(null)
  const [fullInvoiceDetails, setFullInvoiceDetails] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [dataSource, setDataSource] = useState<'zoho_live' | 'local_db' | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [actionLoading, setActionLoading] = useState("")
  // Cost processing result stored inline (replaces alert)
  const [costResult, setCostResult] = useState<any | null>(null)
  
  // Modals state
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [showDropshipmentModal, setShowDropshipmentModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  
  // Tabs state
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'communications' | 'notes_tasks' | 'pdf_preview'>('overview')
  
  // Discount state
  const [discountPercentage, setDiscountPercentage] = useState<number>(5)

  const [usersList, setUsersList] = useState<any[]>([])
  useEffect(() => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => {
        if (data.users) {
          setUsersList(data.users)
        }
      })
      .catch(() => {})
  }, [])

  // Line item editing state
  const [isEditingLineItems, setIsEditingLineItems] = useState(false)
  const [editableLineItems, setEditableLineItems] = useState<any[]>([])
  const [isSavingLineItems, setIsSavingLineItems] = useState(false)

  // Determine the base zoho ID and any existing data
  const currentInvoice = internalInvoiceOverride || invoice
  const currentType = internalTypeOverride || type

  const isString = typeof currentInvoice === "string"
  const zohoId = isString ? currentInvoice : (currentInvoice?.zohoId || currentInvoice?.id)
  const initialData = isString ? { id: zohoId, zohoId } : currentInvoice

  const fetchDetails = async (force = false) => {
    if (!zohoId) return
    setIsLoading(true)
    try {
      const url = `/api/get-invoice-details?targetId=${zohoId}&type=${currentType}${force ? '&force=true' : ''}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success && (data.invoice || data.document || data.salesorder || data.estimate)) {
        const doc = data.invoice || data.document || data.salesorder || data.estimate
        setFullInvoiceDetails(doc)
        setDataSource(data._source === 'local_db' ? 'local_db' : 'zoho_live')
        setCachedAt(doc._cachedAt || null)
      }
    } catch (e) {
      console.error("Failed to load full document details", e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!zohoId) return;

    // If it already has custom fields, seed it immediately (no spinner)
    if (!isString && currentInvoice?.items?.custom_fields) {
      setFullInvoiceDetails({ custom_fields: currentInvoice.items.custom_fields, ...currentInvoice })
    } else {
      // Clear old details while fetching new
      setFullInvoiceDetails(null)
    }

    fetchDetails(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zohoId, currentType])

  // Keyboard navigation: left/right arrows when a list is provided
  const hasList = invoiceList && invoiceList.length > 1 && onNavigate !== undefined && currentIndex !== undefined
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!hasList) return
    if (e.key === "ArrowLeft" && currentIndex! > 0) onNavigate!(currentIndex! - 1)
    if (e.key === "ArrowRight" && currentIndex! < invoiceList!.length - 1) onNavigate!(currentIndex! + 1)
    if (e.key === "Escape") onClose()
  }, [hasList, currentIndex, invoiceList, onNavigate, onClose])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const displayData = fullInvoiceDetails || initialData

  const handleConvert = async (targetType: "SalesOrder" | "Invoice") => {
    setIsConverting(true)
    try {
      const res = await fetch("/api/zoho-convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: type,
          sourceId: zohoId,
          targetType
        })
      })
      if (!res.ok) {
        alert(`Server error (${res.status}) converting document.`)
        return
      }
      const data = await res.json()
      if (data.success) {
        alert(`Successfully converted to ${targetType}!`)
        onClose()
      } else {
        alert(`Failed to convert: ${data.message || data.error}`)
      }
    } catch (e: any) {
      alert(`Error converting document: ${e.message}`)
    } finally {
      setIsConverting(false)
    }
  }

  const handleSaveLineItems = async () => {
    setIsSavingLineItems(true)
    try {
      const res = await fetch("/api/zoho-update-line-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zohoId: zohoId,
          type: type,
          lineItems: editableLineItems
        })
      })
      if (!res.ok) {
        alert(`Server error (${res.status}) saving line items.`)
        return
      }
      const data = await res.json()
      if (data.success) {
        setIsEditingLineItems(false)
        fetchDetails(true) // Refresh list
      } else {
        alert("Failed to save line items: " + (data.error || "Unknown error"))
      }
    } catch (e: any) {
      alert("Error saving line items: " + e.message)
    } finally {
      setIsSavingLineItems(false)
    }
  }
  const handleApplyDiscount = async () => {
    if (!confirm(`Are you sure you want to apply a ${discountPercentage}% early payment discount?`)) return
    setIsConverting(true)
    try {
      const res = await fetch("/api/zoho-apply-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: zohoId,
          remove: false,
          discountPercentage
        })
      })
      if (!res.ok) {
        alert(`Server error (${res.status}) applying discount.`)
        return
      }
      const data = await res.json()
      if (data.success) {
        alert("Discount applied successfully!")
        onClose()
      } else {
        alert(`Failed to apply discount: ${data.message || data.error}`)
      }
    } catch (e: any) {
      alert(`Error applying discount: ${e.message}`)
    } finally {
      setIsConverting(false)
    }
  }

  // ------ New Action Handlers ------

  const handleSendEmail = async () => {
    const docLabel = currentType === 'Quote' ? 'quote' : currentType === 'SalesOrder' ? 'sales order' : 'invoice'
    if (!confirm(`Send this ${docLabel} via email to the customer?`)) return
    setActionLoading("email")
    try {
      const endpoint = type === 'Invoice' ? '/api/zoho-email-invoice' : '/api/zoho-send-document'
      const bodyPayload = type === 'Invoice'
        ? { invoiceId: zohoId }
        : { documentId: zohoId, type }
      
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      })
      if (!res.ok) {
        alert(`Server error (${res.status}) sending document email.`)
        return
      }
      const data = await res.json()
      if (data.success) {
        alert(`✅ ${type === 'Quote' ? 'Quote' : type === 'SalesOrder' ? 'Sales Order' : 'Invoice'} sent to customer!`)
      } else {
        alert(`Failed to send: ${data.error || data.message}`)
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading("")
    }
  }

  const handleVoid = async () => {
    const docLabel = type === 'Quote' ? 'quote' : type === 'SalesOrder' ? 'sales order' : 'invoice'
    if (!confirm(`⚠ï¸  Are you sure you want to VOID this ${docLabel}? This action cannot be easily undone.`)) return
    setActionLoading("void")
    try {
      const res = await fetch("/api/zoho-void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: zohoId, type })
      })
      const data = await res.json()
      if (data.success) {
        alert(`✅ ${type} voided successfully.`)
        onClose()
      } else {
        alert(`Failed to void: ${data.error || data.message}`)
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading("")
    }
  }

  const handleUpdateStatus = async (action: string) => {
    const labels: Record<string, string> = {
      confirm: 'Confirm this sales order?',
      accepted: 'Mark this quote as accepted?',
      declined: 'Mark this quote as declined?',
    }
    if (!confirm(labels[action] || `Update status to ${action}?`)) return
    setActionLoading(action)
    try {
      const res = await fetch("/api/zoho-update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: zohoId, type, action })
      })
      const data = await res.json()
      if (data.success) {
        alert(`✅ Status updated!`)
        onClose()
      } else {
        alert(`Failed: ${data.error || data.message}`)
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading("")
    }
  }

  const handleProcessCosts = async () => {
    const docLabel = type === 'Quote' ? 'quote/estimate' : type === 'SalesOrder' ? 'sales order' : 'invoice'
    if (!confirm(`Calculate and write all costs, profit, and commission fields for this ${docLabel}?`)) return
    setActionLoading("process-costs")
    setCostResult(null)
    try {
      let endpoint = '/api/process-invoice-costs'
      let bodyPayload: Record<string, any> = {}

      if (type === 'SalesOrder') {
        endpoint = '/api/process-salesorder-costs'
        const soNumber = displayData?.salesorder_number || displayData?.items?.salesOrderNumber
        bodyPayload = soNumber ? { salesorderNumber: soNumber } : { salesorderId: zohoId }
      } else if (type === 'Quote') {
        endpoint = '/api/process-quote-costs'
        const estNumber = displayData?.estimate_number || displayData?.items?.estimateNumber
        bodyPayload = estNumber ? { estimateNumber: estNumber } : { estimateId: zohoId }
      } else {
        const invoiceNumber = displayData?.invoice_number || displayData?.items?.invoiceNumber || displayData?.invoiceNumber
        bodyPayload = invoiceNumber ? { invoiceNumber } : { invoiceId: zohoId }
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      })
      const data = await res.json()
      if (data.success) {
        // Store result to show inline; key varies by doc type
        const result = data.invoice || data.salesorder || data.estimate || data
        setCostResult(result)
      } else {
        alert(`Failed: ${data.error}`)
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading("")
    }
  }

  const typeColor = currentType === 'Quote' ? 'text-purple-400' : currentType === 'SalesOrder' ? 'text-blue-400' : 'text-amber-500'
  const typeLabel = currentType === 'Quote' ? 'Quote/Estimate' : currentType === 'SalesOrder' ? 'Sales Order' : 'Invoice'
  const statusLower = (displayData?.status || '').toLowerCase()
  const isVoided = statusLower === 'void' || statusLower === 'voided'
  const isPaid = statusLower === 'paid'
  const balanceDue = parseFloat(displayData?.balance || 0)

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 animate-fade-in overflow-hidden">
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel border border-white/10 w-full max-w-6xl max-h-[90vh] my-auto rounded-2xl overflow-hidden flex flex-col shadow-2xl z-[10000] animate-scale-in">

        
        {/* Modals */}
        {showPackageModal && displayData?.line_items && (
          <CreatePackageModal 
            salesOrderId={zohoId} 
            lineItems={displayData.line_items}
            onClose={() => setShowPackageModal(false)}
            onSuccess={(pkgId) => {
              alert(`Package created successfully! ID: ${pkgId}`)
              setShowPackageModal(false)
            }}
          />
        )}
        {showDropshipmentModal && displayData?.line_items && (
          <CreateDropshipmentModal 
            salesOrderId={zohoId} 
            lineItems={displayData.line_items}
            onClose={() => setShowDropshipmentModal(false)}
            onSuccess={(poId) => {
              alert(`Dropshipment Purchase Order created successfully! ID: ${poId}`)
              setShowDropshipmentModal(false)
            }}
          />
        )}
        {showPaymentModal && (
          <RecordPaymentModal
            invoiceId={zohoId}
            customerId={displayData?.customer_id || displayData?.items?.customerId || ""}
            balance={balanceDue}
            invoiceNumber={displayData?.invoice_number || displayData?.items?.invoiceNumber || ""}
            customerName={displayData?.customer_name || ""}
            onClose={() => setShowPaymentModal(false)}
            onSuccess={() => {
              alert("✅ Payment recorded successfully!")
              setShowPaymentModal(false)
              onClose()
            }}
          />
        )}

        {/* ------ Header ------ */}
        <div className="glass-panel px-3 sm:px-6 py-3 sm:py-4 border-b border-white/10 flex justify-between items-center shrink-0 gap-2">
          <div className="min-w-0 flex items-center gap-3">
            <div className="min-w-0">
              <h2 className={`text-sm font-bold flex items-center gap-2 ${typeColor}`}>
                <FiFileText className="shrink-0" /> <span className="truncate">{typeLabel} Details</span>
              </h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-neutral-400 font-mono truncate">Zoho ID: {zohoId}</p>
                  <a
                    href={`https://books.zoho.com/app/685934575#/${currentType === 'Quote' ? 'estimates' : currentType === 'SalesOrder' ? 'salesorders' : 'invoices'}/${zohoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[9px] font-bold uppercase text-sky-400 hover:text-sky-300 hover:underline bg-sky-950/40 border border-sky-500/30 px-1.5 py-0.5 rounded transition-colors"
                  >
                    Open in Zoho Books <FiExternalLink size={10} />
                  </a>
                </div>
                {dataSource === 'local_db' && (
                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-sky-400 bg-sky-900/20 border border-sky-800/40 rounded px-1.5 py-0.5">
                    ⚡ Cached{cachedAt ? ` . ${(() => { const mins = Math.round((Date.now() - new Date(cachedAt).getTime()) / 60000); return mins < 60 ? `${mins}m ago` : `${Math.round(mins/60)}h ago` })()}` : ''}
                  </span>
                )}
                {dataSource === 'zoho_live' && (
                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 rounded px-1.5 py-0.5">
                    ✨ Live
                  </span>
                )}
                {!isLoading && (
                  <button
                    onClick={() => fetchDetails(true)}
                    title="Force refresh from Zoho Books"
                    className="text-[9px] text-neutral-500 hover:text-neutral-300 transition-colors underline"
                  >
                    Refresh
                  </button>
                )}
              </div>
            </div>
            {/* Prev / Next navigation */}
            {hasList && (
              <div className="flex items-center gap-1 bg-black/20 border border-white/10 rounded-lg p-0.5 shrink-0">
                <button
                  onClick={() => onNavigate!(currentIndex! - 1)}
                  disabled={currentIndex === 0}
                  title="Previous invoice ( from )"
                  className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <FiChevronLeft size={14} />
                </button>
                <span className="text-[10px] font-bold text-neutral-400 px-1 tabular-nums">
                  {currentIndex! + 1} / {invoiceList!.length}
                </span>
                <button
                  onClick={() => onNavigate!(currentIndex! + 1)}
                  disabled={currentIndex === invoiceList!.length - 1}
                  title="Next invoice ( to )"
                  className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <FiChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end shrink-0">
            
            {/* ------ QUOTE ACTIONS ------ */}
            {currentType === "Quote" && !isVoided && (
              <div className="flex items-center gap-1 glass-panel border border-white/10 rounded-lg p-0.5 sm:p-1">
                <button 
                  onClick={() => handleUpdateStatus("accepted")}
                  disabled={!!actionLoading}
                  className="bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <FiCheckCircle className="shrink-0" size={12} /> <span className="hidden sm:inline">Accept</span>
                </button>
                <button 
                  onClick={() => handleUpdateStatus("declined")}
                  disabled={!!actionLoading}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <FiXCircle className="shrink-0" size={12} /> <span className="hidden sm:inline">Decline</span>
                </button>
                <div className="w-px h-4 bg-neutral-800 mx-0.5"></div>
                <button 
                  onClick={() => handleConvert("SalesOrder")}
                  disabled={isConverting}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors shadow shadow-blue-900/20 disabled:opacity-50 flex items-center gap-1"
                >
                  <FiRefreshCw className={`shrink-0 ${isConverting ? "animate-spin" : ""}`} size={12} /> <span className="hidden sm:inline">Convert to</span> SO
                </button>
              </div>
            )}
            
            {/* ------ SALES ORDER ACTIONS ------ */}
            {currentType === "SalesOrder" && !isVoided && (
              <div className="flex items-center gap-1 glass-panel border border-white/10 rounded-lg p-0.5 sm:p-1">
                {statusLower !== 'confirmed' && statusLower !== 'shipped' && (
                  <button 
                    onClick={() => handleUpdateStatus("confirm")}
                    disabled={!!actionLoading}
                    className="bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    <FiCheck className="shrink-0" size={12} /> <span className="hidden sm:inline">Confirm</span>
                  </button>
                )}
                <button 
                  onClick={() => setShowPackageModal(true)}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1"
                >
                  <FiBox className="shrink-0" size={12} /> <span className="hidden sm:inline">Package</span>
                </button>
                <button 
                  onClick={() => setShowDropshipmentModal(true)}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors flex items-center gap-1"
                >
                  <FiTruck className="shrink-0" size={12} /> <span className="hidden sm:inline">Dropship</span>
                </button>
                <div className="w-px h-4 bg-neutral-800 mx-0.5"></div>
                <button 
                  onClick={() => handleConvert("Invoice")}
                  disabled={isConverting}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors shadow shadow-emerald-900/20 disabled:opacity-50 flex items-center gap-1"
                >
                  <FiRefreshCw className={`shrink-0 ${isConverting ? "animate-spin" : ""}`} size={12} /> <span className="hidden sm:inline">Invoice</span>
                </button>
              </div>
            )}

            {/* ------ INVOICE ACTIONS ------ */}
            {currentType === "Invoice" && !isVoided && (
              <div className="flex items-center gap-1 glass-panel border border-white/10 rounded-lg p-0.5 sm:p-1">
                {/* Record Payment (only if not fully paid) */}
                {!isPaid && balanceDue > 0 && (
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors shadow shadow-emerald-900/20 flex items-center gap-1"
                  >
                    <FiDollarSign className="shrink-0" size={12} /> <span className="hidden sm:inline">Record</span> Payment
                  </button>
                )}
                
                {/* Payoff Discount (not overdue, not paid) */}
                {!isPaid && statusLower !== 'overdue' && (
                  <>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discountPercentage}
                      onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                      className="w-10 sm:w-12 bg-neutral-800 border border-neutral-700 text-white text-xs font-bold rounded px-1 sm:px-1.5 py-1 text-center focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-xs text-neutral-400 font-bold mr-0.5">%</span>
                    <button
                      onClick={handleApplyDiscount}
                      disabled={isConverting}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-2 py-1 rounded text-[10px] sm:text-xs transition-colors shadow shadow-blue-900/20 disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
                    >
                      {isConverting ? <FiRefreshCw className="animate-spin shrink-0" size={12} /> : <FiDatabase className="shrink-0" size={12} />}
                      <span className="hidden sm:inline">Payoff</span> Disc
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ------ SHARED ACTIONS (all document types) ------ */}
            <div className="flex items-center gap-1">
              {/* Process Costs -- all document types */}
              {!isVoided && (
                <button
                  onClick={handleProcessCosts}
                  disabled={!!actionLoading}
                  className="bg-amber-600/80 hover:bg-amber-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                >
                  {actionLoading === "process-costs" ? <FiRefreshCw className="animate-spin shrink-0" size={12} /> : <FiCpu className="shrink-0" size={12} />}
                  <span className="hidden sm:inline">Process</span> Costs
                </button>
              )}
              {/* Send Email */}
              {!isVoided && (
                <button
                  onClick={handleSendEmail}
                  disabled={!!actionLoading}
                  className="bg-sky-600/80 hover:bg-sky-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                >
                  {actionLoading === "email" ? <FiRefreshCw className="animate-spin shrink-0" size={12} /> : <FiMail className="shrink-0" size={12} />}
                  <span className="hidden sm:inline">Send</span> Email
                </button>
              )}

              {/* Void / Cancel */}
              {!isVoided && !isPaid && (
                <button
                  onClick={handleVoid}
                  disabled={!!actionLoading}
                  className="bg-red-600/60 hover:bg-red-500 text-white font-bold px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                >
                  {actionLoading === "void" ? <FiRefreshCw className="animate-spin shrink-0" size={12} /> : <FiSlash className="shrink-0" size={12} />}
                  Void
                </button>
              )}

              {/* Download PDF */}
              <a
                href={`/api/get-invoice-pdf?id=${zohoId}&type=${type}&download=true`}
                target="_blank"
                rel="noreferrer"
                className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs transition-colors border border-neutral-700 flex items-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FiDownload className="shrink-0" size={12} /> <span className="hidden sm:inline">Download</span> PDF
              </a>

              {/* Close Button */}
              <button 
                onClick={onClose} 
                className="text-neutral-400 hover:text-white p-1 bg-neutral-800 hover:bg-neutral-755 transition-colors rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center font-bold text-base sm:text-lg cursor-pointer shrink-0"
              >
                &times;
              </button>
            </div>
          </div>
        </div>

        {/* ------ Tabs ------ */}
        <div className="flex border-b border-white/10 glass-panel px-4 pt-2 gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-2 px-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'overview' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('financials')}
            className={`pb-2 px-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'financials' ? 'border-emerald-500 text-emerald-400 font-extrabold' : 'border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
          >
            📊 Financial Derivation
          </button>
          <button
            onClick={() => setActiveTab('communications')}
            className={`pb-2 px-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'communications' ? 'border-blue-500 text-blue-400' : 'border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Communications
          </button>
          <button
            onClick={() => setActiveTab('notes_tasks')}
            className={`pb-2 px-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'notes_tasks' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Notes &amp; Tasks
          </button>
          <button
            onClick={() => setActiveTab('pdf_preview')}
            className={`pb-2 px-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'pdf_preview' ? 'border-blue-500 text-blue-400' : 'border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
          >
            PDF Document
          </button>
        </div>

        {/* ------ Content ------ */}
        {activeTab === 'financials' ? (
          <div className="flex-1 bg-black/20 overflow-y-auto p-4 sm:p-5">
            {(() => {
              const src = costResult || displayData?.items || displayData || {}
              const subTotalVal = parseFloat(displayData.sub_total || displayData.total || displayData.amount || src.subTotal || 0)
              const deadCostTotalVal = parseFloat(src.deadCostTotal || displayData.deadCostTotal || 0)
              const deadCostSubjectVal = parseFloat(src.deadCostSubjectToVig || src.deadCostTotal || displayData.deadCostSubjectToVig || 0)
              const vigRateVal = parseFloat(src.vigRate || displayData.vigRate || 1.3)
              const profitVal = parseFloat(src.profit || displayData.profit || 0)
              const commVal = parseFloat(src.commission || src.salesCommission || displayData.salesCommission || 0)
              const isPaidVal = statusLower === 'paid' || displayData.status === 'Paid' || displayData.isPaid

              const matchedRep = usersList.find(u => {
                const spName = (displayData.salesperson_name || displayData.salespersonName || "").toLowerCase().trim()
                return u.id === displayData.ownerId || 
                       u.zohoId === displayData.ownerId || 
                       (u.name && u.name.toLowerCase().trim() === spName)
              })
              const payoutStructureVal = matchedRep?.payoutStructure || 'two_payment'

              return (
                <InvoiceFinancialBreakdown
                  payoutStructure={payoutStructureVal}
                  subTotal={subTotalVal}
                  deadCostTotal={deadCostTotalVal}
                  deadCostSubjectToVig={deadCostSubjectVal}
                  deadCostNoVig={parseFloat(src.deadCostNoVig || displayData.deadCostNoVig || 0)}
                  vigRate={vigRateVal}
                  profit={profitVal}
                  salesCommission={commVal}
                  salespersonName={displayData.salesperson_name || displayData.salespersonName || ""}
                  isPaid={isPaidVal}
                  paymentDate={displayData.paymentDate || displayData.paidDate || displayData.payment_date || src.paymentDate || null}
                  lineItemDetails={
                    // Prefer pre-calculated lineItemDetails from DB (has correct deadCost from purchase_rate)
                    // Fall back to building from raw line_items using purchase_rate
                    (displayData.items?.lineItemDetails) ||
                    displayData.line_items?.map((item: any) => ({
                      name: item.name || item.description || "Item",
                      quantity: parseFloat(item.quantity || 1),
                      rate: parseFloat(item.rate || item.price || 0),
                      cost: parseFloat(item.purchase_rate || item.pricebook_rate || item.b2bCost || 0),
                      deadCost: parseFloat(item.purchase_rate || item.pricebook_rate || 0) * parseFloat(item.quantity || 1),
                      noVig: item.noVig || item.isNoVig
                    })) || []}
                  customFields={displayData.custom_fields || displayData.customFields || []}
                />
              )
            })()}
          </div>
        ) : activeTab === 'overview' ? (
          <div className="flex-1 bg-black/20 overflow-y-auto p-4 sm:p-5 flex flex-col gap-5">
            <div>
              <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><FiDatabase className="text-sky-400 shrink-0" /> Data View</h3>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">{currentType === 'Quote' ? 'Quote' : currentType === 'SalesOrder' ? 'SO' : 'Invoice'} #</label>
                  <div className="text-sm text-white font-mono truncate">{displayData.items?.invoiceNumber || displayData.items?.invoice_number || displayData.items?.salesOrderNumber || displayData.items?.salesorder_number || displayData.items?.estimateNumber || displayData.items?.estimate_number || displayData.invoiceNumber || displayData.invoice_number || displayData.salesorder_number || displayData.estimate_number || displayData.zohoId || "--"}</div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Amount</label>
                  <div className="text-sm text-emerald-400 font-bold">${parseFloat(displayData.amount || displayData.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Status</label>
                  <div className={`text-sm font-bold ${displayData.status === 'Paid' || displayData.status === 'paid' ? 'text-blue-400' : displayData.status === 'Overdue' || displayData.status === 'overdue' ? 'text-red-400' : isVoided ? 'text-neutral-500' : 'text-amber-400'}`}>{displayData.status || "--"}</div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Issue Date</label>
                  <div className="text-sm text-white">{displayData.issueDate || displayData.date ? new Date(displayData.issueDate || displayData.date).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "--"}</div>
                </div>
                {displayData.due_date && (
                  <div>
                    <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Due Date</label>
                    <div className="text-sm text-white">{new Date(displayData.due_date).toLocaleDateString(undefined, { timeZone: 'UTC' })}</div>
                  </div>
                )}
                {displayData.salesperson_name && (
                  <div>
                    <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Salesperson</label>
                    <div className="text-sm text-white font-semibold truncate">{displayData.salesperson_name}</div>
                  </div>
                )}
                {(displayData.customer_name || displayData.customer_id) && (
                  <div>
                    <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Customer / Account</label>
                    {displayData.customer_id || displayData.items?.customerId ? (
                      <Link
                        href={`/account?id=${displayData.customer_id || displayData.items?.customerId}`}
                        className="text-sm font-bold text-sky-400 hover:text-sky-300 hover:underline truncate block"
                      >
                        🏢 {displayData.customer_name || displayData.customer_id}
                      </Link>
                    ) : (
                      <div className="text-sm text-white font-semibold truncate">{displayData.customer_name}</div>
                    )}
                  </div>
                )}
                {displayData.vigRate && (
                  <div>
                    <label className="text-[10px] text-emerald-500 uppercase font-bold tracking-wider flex items-center gap-1">VIG Rate</label>
                    <div className="text-sm font-black text-emerald-400 bg-emerald-500/10 inline-block px-2 py-0.5 rounded border border-emerald-500/20">
                      {displayData.vigRate}x
                    </div>
                  </div>
                )}
                {displayData.balance != null && displayData.balance > 0 && (
                  <div>
                    <label className="text-[10px] text-red-400 uppercase font-bold tracking-wider">Balance Due</label>
                    <div className="text-sm font-bold text-red-400">${parseFloat(displayData.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                )}
              </div>

              {/* --- Document Chain Links (Sales Order, Packages, Shipments) --- */}
              <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                <h4 className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                  <FiBox /> Document Chain & Fulfillment Trace
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-black/40 p-3 rounded-xl border border-white/10 text-xs">
                  {/* Originating Sales Order */}
                  <div>
                    <span className="text-neutral-500 block text-[10px] uppercase font-bold">Originating Sales Order</span>
                    {displayData.salesorder_number || displayData.salesorder_id || displayData.items?.salesorder_number || displayData.rawData?.salesorder_number ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono font-bold text-sky-400">
                          #{displayData.salesorder_number || displayData.items?.salesorder_number || displayData.rawData?.salesorder_number || displayData.salesorder_id}
                        </span>
                        <button
                          onClick={() => {
                            const soId = displayData.salesorder_id || displayData.items?.salesorder_id || displayData.rawData?.salesorder_id
                            if (soId) {
                              setInternalInvoiceOverride(soId)
                              setInternalTypeOverride("SalesOrder")
                              fetchDetails(false)
                            }
                          }}
                          className="text-[9px] px-2 py-0.5 bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 font-bold rounded border border-sky-500/30 transition-colors"
                        >
                          View Sales Order ↗
                        </button>
                      </div>
                    ) : (
                      <span className="text-neutral-600 italic">Direct Invoice (No Sales Order)</span>
                    )}
                  </div>

                  {/* Originating Quote / Estimate */}
                  <div>
                    <span className="text-neutral-500 block text-[10px] uppercase font-bold">Originating Quote / Estimate</span>
                    {displayData.estimate_number || displayData.estimate_id || displayData.items?.estimate_number || displayData.rawData?.estimate_number ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono font-bold text-amber-400">
                          #{displayData.estimate_number || displayData.items?.estimate_number || displayData.rawData?.estimate_number || displayData.estimate_id}
                        </span>
                      </div>
                    ) : (
                      <span className="text-neutral-600 italic">N/A</span>
                    )}
                  </div>
                </div>

                {/* Packages & Shipments Table */}
                {((displayData.packages && displayData.packages.length > 0) || (displayData.shipments && displayData.shipments.length > 0) || displayData.tracking_number) && (
                  <div className="bg-black/40 p-3 rounded-xl border border-white/10 space-y-2">
                    <span className="text-[10px] text-cyan-400 uppercase font-bold tracking-wider flex items-center gap-1">
                      <FiTruck /> Packages & Shipment Tracking
                    </span>
                    <div className="space-y-1.5">
                      {(displayData.packages || displayData.items?.packages || []).map((pkg: any, pIdx: number) => (
                        <div key={pIdx} className="flex items-center justify-between text-xs font-mono bg-white/5 p-2 rounded border border-white/5">
                          <span className="font-bold text-white">Pkg #{pkg.package_number || pkg.package_id || pIdx+1}</span>
                          <span className="text-neutral-400">Carrier: {pkg.carrier || "Standard"}</span>
                          <span className="text-cyan-300 font-bold">Trk: {pkg.tracking_number || "Pending"}</span>
                          <span className="px-2 py-0.5 text-[9px] rounded uppercase font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                            {pkg.status || "Shipped"}
                          </span>
                        </div>
                      ))}
                      {displayData.tracking_number && (!displayData.packages || displayData.packages.length === 0) && (
                        <div className="flex items-center justify-between text-xs font-mono bg-white/5 p-2 rounded border border-white/5">
                          <span className="font-bold text-white">Direct Shipment</span>
                          <span className="text-neutral-400">Carrier: {displayData.carrier || "Standard"}</span>
                          <span className="text-cyan-300 font-bold">Trk: {displayData.tracking_number}</span>
                          <span className="px-2 py-0.5 text-[9px] rounded uppercase font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            In Transit
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* --- Payments Made (Zoho Books) --- */}
              {displayData?.payments && displayData.payments.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/10">
                  <h4 className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider mb-2">Payments Applied</h4>
                  <div className="flex flex-col gap-1.5">
                    {displayData.payments.map((pmt: any) => (
                      <div key={pmt.payment_id || pmt.id} className="flex justify-between items-center bg-black/20 p-2.5 rounded-lg border border-white/5">
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            ${parseFloat(pmt.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            {pmt.payment_mode && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 uppercase tracking-wider font-bold">
                                {pmt.payment_mode}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-400 mt-0.5">
                            {pmt.date} {pmt.reference_number ? `| Ref: ${pmt.reference_number}` : ''}
                          </div>
                        </div>

                        {pmt.payment_id && (
                          <a
                            href={`https://books.zoho.com/app/685934575#/customerpayments/${pmt.payment_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 hover:underline bg-emerald-950/40 border border-emerald-500/30 px-2 py-1 rounded transition-colors"
                          >
                            Payment  up 
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* --- Shipping Cost Flag --- */}
              {currentType === "Invoice" && !isVoided && displayData?.shipping_charge !== undefined && parseFloat(displayData.shipping_charge || 0) === 0 && statusLower !== 'draft' && (
                <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 animate-pulse">
                  <span className="text-amber-400 text-lg">⚠</span>
                  <div>
                    <div className="text-[10px] uppercase font-black text-amber-400 tracking-wider">Needs Shipping Costs</div>
                    <div className="text-[10px] text-amber-300/70">Shipping charge is $0.00 -- update in Zoho Books</div>
                  </div>
                </div>
              )}
            </div>

            {/* --- Tracking & Fulfillment --- */}
            {((displayData.packages && displayData.packages.length > 0) || (displayData.dropshipments && displayData.dropshipments.length > 0)) && (
              <div className="pt-3 border-t border-white/10">
                <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><FiTruck className="text-sky-400 shrink-0" /> Tracking &amp; Fulfillment</h3>
                <div className="flex flex-col gap-2">
                  {displayData.packages?.map((pkg: any) => {
                    const trackingNumber = pkg.trackingNumber || pkg.tracking_number
                    const carrier = pkg.carrier || pkg.shipment_carrier || 'Carrier'
                    const packageId = pkg.package_id || pkg.id
                    const trackUrl = trackingNumber ? (
                      carrier.toLowerCase().includes('fedex') ? `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}` :
                      carrier.toLowerCase().includes('ups') ? `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}` :
                      carrier.toLowerCase().includes('usps') ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}` :
                      `https://www.google.com/search?q=tracking+${encodeURIComponent(trackingNumber)}`
                    ) : null

                    return (
                      <div key={pkg.id || pkg.packageNumber} className="glass-panel border border-white/10 rounded-lg p-3 flex justify-between items-center">
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-2">
                            PKG: {packageId ? (
                              <a
                                href={`https://books.zoho.com/app/685934575#/packages/${packageId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1"
                              >
                                {pkg.packageNumber || packageId} <FiExternalLink size={11} />
                              </a>
                            ) : (
                              pkg.packageNumber || 'Pending'
                            )}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${pkg.status?.toLowerCase() === 'shipped' || pkg.status?.toLowerCase() === 'delivered' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                              {pkg.status || 'Packaged'}
                            </span>
                          </div>
                          <div className="text-xs text-neutral-400 mt-1">
                            Carrier: <span className="text-neutral-200">{carrier}</span> | 
                            Tracking: {trackUrl ? (
                              <a
                                href={trackUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-sky-400 hover:text-sky-300 hover:underline inline-flex items-center gap-1 ml-1"
                              >
                                {trackingNumber} <FiExternalLink size={10} />
                              </a>
                            ) : (
                              <span className="font-mono text-neutral-300 ml-1">{trackingNumber || '--'}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {displayData.dropshipments?.map((ds: any) => {
                    const trackingNumber = ds.trackingNumber || ds.tracking_number
                    const trackUrl = trackingNumber ? `https://www.google.com/search?q=tracking+${encodeURIComponent(trackingNumber)}` : null

                    return (
                      <div key={ds.id || ds.trackingNumber} className="glass-panel border border-white/10 rounded-lg p-3 flex justify-between items-center">
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-2">
                            DROPSHIP: {ds.vendorName || 'Vendor'}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${ds.status?.toLowerCase() === 'shipped' || ds.status?.toLowerCase() === 'delivered' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                              {ds.status || 'Ordered'}
                            </span>
                          </div>
                          <div className="text-xs text-neutral-400 mt-1">
                            Tracking: {trackUrl ? (
                              <a
                                href={trackUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-sky-400 hover:text-sky-300 hover:underline inline-flex items-center gap-1 ml-1"
                              >
                                {trackingNumber} <FiExternalLink size={10} />
                              </a>
                            ) : (
                              <span className="font-mono text-neutral-300 ml-1">{trackingNumber || '--'}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
  
              <div className="pt-3 border-t border-white/10">
                <DocumentLifecycle 
                  zohoId={zohoId} 
                  type={currentType} 
                  onNavigateDoc={(navType, navId) => {
                    setInternalInvoiceOverride(navId)
                    setInternalTypeOverride(navType)
                  }}
                />
              </div>

            {/* --- Visual Financial & Commission Derivation Card --- */}
            <div className="pt-3 border-t border-white/10">
              {(() => {
                const src = costResult || displayData?.items || displayData || {}
                const subTotalVal = parseFloat(displayData.sub_total || displayData.total || displayData.amount || src.subTotal || 0)
                const deadCostTotalVal = parseFloat(src.deadCostTotal || displayData.deadCostTotal || 0)
                const deadCostSubjectVal = parseFloat(src.deadCostSubjectToVig || src.deadCostTotal || displayData.deadCostSubjectToVig || 0)
                const vigRateVal = parseFloat(src.vigRate || displayData.vigRate || 1.3)
                const profitVal = parseFloat(src.profit || displayData.profit || 0)
                const commVal = parseFloat(src.commission || src.salesCommission || displayData.salesCommission || 0)
                const isPaidVal = statusLower === 'paid' || displayData.status === 'Paid' || displayData.isPaid

                const matchedRep = usersList.find(u => {
                  const spName = (displayData.salesperson_name || displayData.salespersonName || "").toLowerCase().trim()
                  return u.id === displayData.ownerId || 
                         u.zohoId === displayData.ownerId || 
                         (u.name && u.name.toLowerCase().trim() === spName)
                })
                const payoutStructureVal = matchedRep?.payoutStructure || 'two_payment'

                return (
                  <InvoiceFinancialBreakdown
                    payoutStructure={payoutStructureVal}
                    subTotal={subTotalVal}
                    deadCostTotal={deadCostTotalVal}
                    deadCostSubjectToVig={deadCostSubjectVal}
                    deadCostNoVig={parseFloat(src.deadCostNoVig || displayData.deadCostNoVig || 0)}
                    vigRate={vigRateVal}
                    profit={profitVal}
                    salesCommission={commVal}
                    salespersonName={displayData.salesperson_name || displayData.salespersonName || ""}
                    isPaid={isPaidVal}
                    paymentDate={displayData.paymentDate || displayData.paidDate || displayData.payment_date || src.paymentDate || null}
                    lineItemDetails={
                      // Prefer pre-calculated lineItemDetails from DB (has correct deadCost from purchase_rate)
                      // Fall back to building from raw line_items using purchase_rate
                      (displayData.items?.lineItemDetails) ||
                      displayData.line_items?.map((item: any) => ({
                        name: item.name || item.description || "Item",
                        quantity: parseFloat(item.quantity || 1),
                        rate: parseFloat(item.rate || item.price || 0),
                        cost: parseFloat(item.purchase_rate || item.pricebook_rate || item.b2bCost || 0),
                        deadCost: parseFloat(item.purchase_rate || item.pricebook_rate || 0) * parseFloat(item.quantity || 1),
                        noVig: item.noVig || item.isNoVig
                      })) || []}
                    customFields={displayData.custom_fields || displayData.customFields || []}
                  />
                )
              })()}
            </div>

            {/* --- Cost & Commission Panel + Line Items --- */}
            <div className="pt-3 border-t border-white/10 flex flex-col gap-4">

              {isLoading ? (
                <div className="flex justify-center items-center py-8 gap-2 text-sm font-semibold text-neutral-400">
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  Loading details...
                </div>
              ) : (
                <>
                  {/* â"€â"€ Cost & Commission Summary Card â"€â"€ */}
                  {(() => {
                    // Prefer fresh costResult from just-processed data; fall back to stored items blob
                    const src = costResult || displayData?.items || {}
                    const profit       = parseFloat(src.profit ?? src.deadProfitActual ?? NaN)
                    const deadCostTotal = parseFloat(src.deadCostTotal ?? NaN)
                    const deadCostPlusVig = parseFloat(src.deadCostPlusVig ?? NaN)
                    const commission   = parseFloat(src.commission ?? src.salesCommission ?? NaN)
                    const commPct      = parseFloat(src.commissionPercent ?? NaN)
                    const vigRate      = parseFloat(src.vigRate ?? NaN)
                    const total        = parseFloat(displayData?.amount || displayData?.total || 0)
                    const marginPct    = total > 0 && !isNaN(profit) ? (profit / total * 100) : NaN
                    const hasCostData  = !isNaN(deadCostTotal) || !isNaN(profit)
                    if (!hasCostData) return null
                    return (
                      <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/60 to-neutral-950/80 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <FiDollarSign className="text-emerald-400 shrink-0" size={14} />
                          <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Cost &amp; Commission</h4>
                          {costResult && <span className="ml-auto text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold">JUST PROCESSED</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          {!isNaN(deadCostTotal) && (
                            <div>
                              <div className="text-[9px] text-neutral-500 uppercase font-bold tracking-wider">Dead Cost Total</div>
                              <div className="text-sm font-bold text-white">${deadCostTotal.toLocaleString(undefined,{minimumFractionDigits:2})}</div>
                            </div>
                          )}
                          {!isNaN(deadCostPlusVig) && (
                            <div>
                              <div className="text-[9px] text-neutral-500 uppercase font-bold tracking-wider">Dead Cost + VIG</div>
                              <div className="text-sm font-bold text-amber-300">${deadCostPlusVig.toLocaleString(undefined,{minimumFractionDigits:2})}</div>
                            </div>
                          )}
                          {!isNaN(profit) && (
                            <div>
                              <div className="text-[9px] text-neutral-500 uppercase font-bold tracking-wider">Profit</div>
                              <div className={`text-sm font-black ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                ${profit.toLocaleString(undefined,{minimumFractionDigits:2})}
                                {!isNaN(marginPct) && <span className="ml-1 text-[10px] font-bold opacity-70">({marginPct.toFixed(1)}%)</span>}
                              </div>
                            </div>
                          )}
                          {!isNaN(commission) && (
                            <div className="col-span-2 border-t border-white/10 pt-3">
                              <div className="text-[9px] text-neutral-500 uppercase font-bold tracking-wider">Commission Payout Breakdown</div>
                              <div className="text-sm font-black text-sky-400 mb-1.5">
                                ${commission.toLocaleString(undefined,{minimumFractionDigits:2})}
                                {!isNaN(commPct) && <span className="ml-1 text-[10px] font-bold opacity-70 font-sans font-normal">({commPct}% payout)</span>}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-950/60 p-2.5 rounded-lg border border-white/5 text-[11px] font-sans">
                                <div className="space-y-0.5">
                                  <div className="text-[9px] uppercase tracking-wider text-amber-400 font-black">1st Half (Upfront)</div>
                                  <div className="font-bold text-white font-mono">${(commission / 2).toLocaleString(undefined,{minimumFractionDigits:2})}</div>
                                  <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                                    <FiCheckCircle size={10} className="shrink-0" /> Earned on Creation
                                  </div>
                                </div>
                                <div className="space-y-0.5 border-t sm:border-t-0 sm:border-l border-white/10 pt-2 sm:pt-0 sm:pl-2.5">
                                  <div className="text-[9px] uppercase tracking-wider text-emerald-400 font-black">2nd Half (Final)</div>
                                  <div className="font-bold text-white font-mono">${(commission / 2).toLocaleString(undefined,{minimumFractionDigits:2})}</div>
                                  <div>
                                    {isPaid ? (
                                      <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                                        <FiCheckCircle size={10} className="shrink-0" /> Earned (Invoice Paid)
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                                        ⏳ Pending Invoice Payment
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          {!isNaN(vigRate) && (
                            <div>
                              <div className="text-[9px] text-neutral-500 uppercase font-bold tracking-wider">VIG Rate</div>
                              <div className="text-sm font-black text-emerald-300">{vigRate}x</div>
                            </div>
                          )}
                          {costResult?.fieldsUpdated != null && (
                            <div>
                              <div className="text-[9px] text-neutral-500 uppercase font-bold tracking-wider">Zoho Fields Updated</div>
                              <div className="text-sm font-bold text-neutral-300">{costResult.fieldsUpdated}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* â"€â"€ Per-Item Cost Breakdown Table â"€â"€ */}
                  {(() => {
                    let lineItems: any[] = costResult?.lineItemDetails ||
                      (displayData?.items as any)?.lineItemDetails ||
                      []
                    
                    // Filter out manual TRACKING INFORMATION line items
                    lineItems = lineItems.filter(li => {
                      const name = (li.name || li.sku || "").toUpperCase();
                      return !name.includes("TRACKING");
                    })

                    if (!lineItems.length) return null
                    return (
                      <div>
                        <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <FiCpu size={11} className="text-amber-400" /> Itemized Cost Breakdown
                        </h4>
                        <div className="rounded-xl border border-white/10 overflow-hidden">
                          <div className="grid text-[9px] font-black uppercase tracking-wider text-neutral-500 glass-panel/80 px-3 py-1.5" style={{gridTemplateColumns:'1fr 48px 56px 56px 56px 40px'}}>
                            <span>Item</span>
                            <span className="text-right">Qty</span>
                            <span className="text-right">Rate</span>
                            <span className="text-right">Dead Cost</span>
                            <span className="text-right">VIG-DC</span>
                            <span className="text-right">Flags</span>
                          </div>
                                                       {lineItems.map((li: any, idx: number) => {
                              const dcPerUnit = li.deadCost != null ? li.deadCost / (li.quantity || 1) : null
                              const isExempt = li.noVig || isItemExemptFromVig(li)
                              return (
                                <div key={idx} className="grid px-3 py-2 text-xs hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/30 transition-colors" style={{gridTemplateColumns:'1fr 48px 56px 56px 56px 50px'}}>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-white truncate">{li.name || li.sku || `Item ${idx+1}`}</div>
                                    {li.sku && <div className="text-[9px] text-neutral-500 font-mono">{li.sku}</div>}
                                  </div>
                                  <div className="text-right text-neutral-300 self-center">{li.quantity ?? '--'}</div>
                                  <div className="text-right text-neutral-300 self-center">
                                    {li.rate != null ? `$${parseFloat(li.rate).toFixed(2)}` : '--'}
                                  </div>
                                  <div className="text-right self-center">
                                    {li.deadCost != null ? (
                                      <span className="text-amber-300 font-bold">${parseFloat(li.deadCost).toFixed(2)}</span>
                                    ) : '--'}
                                  </div>
                                  <div className="text-right self-center">
                                    {li.deadCost != null && !isExempt ? (
                                      <span className="text-emerald-400 font-bold">${(parseFloat(li.deadCost) * (parseFloat((displayData?.items as any)?.vigRate || costResult?.vigRate || 1.3))).toFixed(2)}</span>
                                    ) : isExempt ? (
                                      <span className="text-amber-400 text-[9px] font-bold">No VIG</span>
                                    ) : '--'}
                                  </div>
                                  <div className="text-right self-center flex justify-end gap-0.5 flex-wrap">
                                    {isExempt ? (
                                      <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1 py-0.5 rounded font-bold border border-amber-500/30">NV</span>
                                    ) : (
                                      <span className="text-[8px] bg-emerald-500/20 text-emerald-300 px-1 py-0.5 rounded font-bold border border-emerald-500/30">VIG</span>
                                    )}
                                    {li.gift && <span className="text-[8px] bg-pink-500/20 text-pink-300 px-1 py-0.5 rounded font-bold">GIFT</span>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          {/* Totals footer */}
                          {(() => {
                            const src = costResult || (displayData?.items as any) || {}
                            const dcTotal = parseFloat(src.deadCostTotal)
                            const dcVig   = parseFloat(src.deadCostPlusVig)
                            if (isNaN(dcTotal)) return null
                            return (
                              <div className="grid px-3 py-2 glass-panel border-t border-neutral-700 text-xs font-bold" style={{gridTemplateColumns:'1fr 48px 56px 56px 56px 40px'}}>
                                <span className="text-neutral-400 uppercase text-[9px] tracking-wider self-center">Totals</span>
                                <span /><span />
                                <span className="text-right text-amber-300">${dcTotal.toFixed(2)}</span>
                                <span className="text-right text-emerald-400">{!isNaN(dcVig) ? `$${dcVig.toFixed(2)}` : ''}</span>
                                <span />
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })()}

                  {/* â"€â"€ Zoho Line Items (from live fetch) â"€â"€ */}
                  {displayData?.line_items && displayData.line_items.filter((li: any) => !(li.name || "").toUpperCase().includes("TRACKING")).length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Line Items</h4>
                        {!isVoided && statusLower !== 'paid' && (
                          <button
                            onClick={() => {
                              if (isEditingLineItems) {
                                setIsEditingLineItems(false)
                              } else {
                                setEditableLineItems(displayData.line_items.filter((li: any) => !(li.name || "").toUpperCase().includes("TRACKING")))
                                setIsEditingLineItems(true)
                              }
                            }}
                            className="text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-2 py-1 rounded font-bold uppercase tracking-wider transition-colors"
                          >
                            {isEditingLineItems ? "Cancel Edit" : "Edit Items"}
                          </button>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        {isEditingLineItems ? (
                          <>
                            {editableLineItems.map((item: any, i: number) => {
                              if (item.line_item_category === 'header') {
                                return (
                                  <div key={item.line_item_id || i} className="glass-panel border border-sky-500/30 rounded-lg p-3 shadow-sm bg-sky-900/10">
                                    <div className="text-xs text-sky-400 font-bold mb-1 uppercase tracking-wider">Header Row</div>
                                    <input 
                                      type="text" 
                                      className="bg-black/50 border border-neutral-700 rounded px-2 py-1 text-sm w-full focus:border-sky-500 focus:outline-none font-bold text-white"
                                      value={item.description || item.name || ''}
                                      placeholder="Header description..."
                                      onChange={(e) => {
                                        const newItems = [...editableLineItems]
                                        newItems[i].description = e.target.value
                                        setEditableLineItems(newItems)
                                      }}
                                    />
                                  </div>
                                )
                              }
                              return (
                                <div key={item.line_item_id || i} className="glass-panel border border-sky-500/30 rounded-lg p-3 shadow-sm bg-sky-900/10">
                                  <div className="flex justify-between gap-2 font-bold text-white text-sm mb-2">
                                    <input 
                                      type="text" 
                                      className="bg-black/50 border border-neutral-700 rounded px-2 py-1 text-sm w-full focus:border-sky-500 focus:outline-none"
                                      value={item.name}
                                      onChange={(e) => {
                                        const newItems = [...editableLineItems]
                                        newItems[i].name = e.target.value
                                        setEditableLineItems(newItems)
                                      }}
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                                    <div className="flex items-center gap-1">
                                      <span className="text-neutral-400">Qty:</span>
                                      <input 
                                        type="number"
                                        className="bg-black/50 border border-neutral-700 rounded px-2 py-1 w-16 focus:border-sky-500 focus:outline-none"
                                        value={item.quantity}
                                        onChange={(e) => {
                                          const newItems = [...editableLineItems]
                                          newItems[i].quantity = Number(e.target.value)
                                          setEditableLineItems(newItems)
                                        }}
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-neutral-400">Price: $</span>
                                      <input 
                                        type="number"
                                        step="0.01"
                                        className="bg-black/50 border border-neutral-700 rounded px-2 py-1 w-24 focus:border-sky-500 focus:outline-none"
                                        value={item.rate}
                                        onChange={(e) => {
                                          const newItems = [...editableLineItems]
                                          newItems[i].rate = Number(e.target.value)
                                          setEditableLineItems(newItems)
                                        }}
                                      />
                                    </div>
                                  </div>
                                  <div className="mt-2">
                                    <textarea 
                                      className="bg-black/50 border border-neutral-700 rounded px-2 py-1 text-xs w-full focus:border-sky-500 focus:outline-none text-neutral-300"
                                      rows={2}
                                      value={item.description || ''}
                                      placeholder="Item description..."
                                      onChange={(e) => {
                                        const newItems = [...editableLineItems]
                                        newItems[i].description = e.target.value
                                        setEditableLineItems(newItems)
                                      }}
                                    />
                                  </div>
                                </div>
                              )
                            })}
                            <button
                              onClick={handleSaveLineItems}
                              disabled={isSavingLineItems}
                              className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 rounded shadow flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-2"
                            >
                              {isSavingLineItems ? <FiRefreshCw className="animate-spin" /> : <FiDatabase />}
                              Save Line Items
                            </button>
                          </>
                        ) : (
                          displayData.line_items.filter((li: any) => !(li.name || "").toUpperCase().includes("TRACKING")).map((item: any, i: number) => {
                            if (item.line_item_category === 'header') {
                              return (
                                <div key={item.line_item_id || i} className="bg-sky-900/30 border-l-2 border-sky-500 rounded-r-lg p-2.5 mt-2">
                                  <div className="font-black text-sky-400 text-xs uppercase tracking-widest">{item.name || item.description}</div>
                                </div>
                              )
                            }
                            if (item.line_item_category === 'subtotal') {
                              return (
                                <div key={item.line_item_id || i} className="glass-panel border-b-2 border-emerald-500/50 rounded-b-lg p-2.5 mt-1 flex justify-between items-center">
                                  <div className="font-black text-emerald-400/80 text-xs uppercase tracking-widest">{item.name || item.description || 'Subtotal'}</div>
                                  <div className="text-emerald-400 font-bold">${parseFloat(item.item_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                </div>
                              )
                            }
                            const isExempt = isItemExemptFromVig(item)
                            return (
                              <div key={item.line_item_id || i} className="glass-panel border border-white/10 rounded-lg p-3 shadow-sm">
                                <div className="flex justify-between gap-2 font-bold text-white text-sm">
                                  <span className="truncate min-w-0 flex items-center gap-2">
                                    {item.name}
                                    {isExempt ? (
                                      <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">No VIG (Exempt)</span>
                                    ) : (
                                      <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Subject to VIG</span>
                                    )}
                                  </span>
                                  <span className="text-emerald-400 shrink-0">${parseFloat(item.item_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-neutral-400">
                                  {item.sku && <span>SKU: <span className="font-mono text-neutral-300">{item.sku}</span></span>}
                                  {item.sku && item.rate && <span>|</span>}
                                  {item.rate && <span>Price: ${parseFloat(item.rate).toLocaleString()}</span>}
                                  {item.purchase_rate != null && <span>| Cost: <span className="text-amber-300 font-bold">${parseFloat(item.purchase_rate).toFixed(2)}</span></span>}
                                  <span>|</span>
                                  <span>Qty: {item.quantity}</span>
                                </div>
                                {item.description && <div className="text-xs text-neutral-500 mt-1 whitespace-pre-wrap line-clamp-3">{item.description}</div>}
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* â"€â"€ Custom Fields (Zoho Books) â"€â"€ */}
                  {displayData?.custom_fields && displayData.custom_fields.filter((f: any) => f.value && f.value !== "" && f.value !== false && f.value !== "false").length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Zoho Custom Fields</h4>
                      <div className="flex flex-col gap-2 pb-4">
                        {displayData.custom_fields
                          .filter((f: any) => f.value && f.value !== "" && f.value !== false && f.value !== "false")
                          .map((field: any) => (
                            <div key={field.customfield_id || field.label} className="glass-panel border border-white/10 rounded-lg p-3 shadow-sm">
                              <label className="text-[10px] text-emerald-500/80 uppercase font-bold tracking-wider mb-1 block">{field.label}</label>
                              {field.data_type === "multiline" || String(field.value).includes("\n") ? (
                                <pre className="text-xs text-neutral-200 font-mono whitespace-pre-wrap break-all bg-black/20 p-2.5 rounded border border-white/10/50">{field.value_formatted || field.value}</pre>
                              ) : (
                                <div className={`text-sm font-bold ${field.data_type === "amount" || field.data_type === "percent" || field.label.includes("VIG") || field.label.includes("COST") || field.label.includes("COMMISSION") ? "text-emerald-400" : "text-white"}`}>
                                  {field.value_formatted || field.value}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* â"€â"€ Raw fallback (no custom fields AND no cost data) â"€â"€ */}
                  {!displayData?.custom_fields && !(displayData?.items as any)?.deadCostTotal && !costResult && (
                    <div className="glass-panel border border-white/10 rounded-lg p-3 overflow-x-auto">
                      <pre className="text-[10px] text-neutral-300 font-mono whitespace-pre-wrap break-all">
                        {JSON.stringify(displayData.items || displayData, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : activeTab === 'pdf_preview' ? (
          <div className="flex-1 glass-panel p-2 sm:p-3 relative flex flex-col min-h-[300px]">
            <iframe
              src={`/api/get-invoice-pdf?id=${zohoId}&type=${type}`}
              className="w-full h-full border-0 rounded-xl bg-black/20 flex-1 shadow-inner"
              title={`${typeLabel} PDF Preview`}
            />
          </div>
        ) : activeTab === 'notes_tasks' ? (
          <div className="flex-1 overflow-y-auto p-4 bg-black/20 min-h-[400px]">
            <DocumentTasks zohoId={zohoId} type={currentType} accountId={displayData.customer_id} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 bg-black/20">
            <SaleCommunications zohoId={zohoId} />
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

