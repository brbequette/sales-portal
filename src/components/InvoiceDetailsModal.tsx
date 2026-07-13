"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { FiFileText, FiDatabase, FiRefreshCw, FiBox, FiTruck, FiDownload, FiMail, FiDollarSign, FiXCircle, FiCheckCircle, FiSlash, FiSend, FiCheck, FiCpu } from "react-icons/fi"
import { CreatePackageModal } from "./CreatePackageModal"
import { CreateDropshipmentModal } from "./CreateDropshipmentModal"
import { RecordPaymentModal } from "./RecordPaymentModal"

interface InvoiceDetailsModalProps {
  invoice: any | string; // Can be an invoice object or just the zohoId string
  type?: "Quote" | "SalesOrder" | "Invoice";
  onClose: () => void;
}

export function InvoiceDetailsModal({ invoice, type = "Invoice", onClose }: InvoiceDetailsModalProps) {
  const [fullInvoiceDetails, setFullInvoiceDetails] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [actionLoading, setActionLoading] = useState("")
  
  // Modals state
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [showDropshipmentModal, setShowDropshipmentModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  
  // Discount state
  const [discountPercentage, setDiscountPercentage] = useState<number>(5)

  // Determine the base zoho ID and any existing data
  const isString = typeof invoice === "string"
  const zohoId = isString ? invoice : (invoice?.zohoId || invoice?.id)
  const initialData = isString ? { id: zohoId, zohoId } : invoice

  useEffect(() => {
    if (!zohoId) return;

    // If it already has custom fields, seed it
    if (!isString && invoice?.items?.custom_fields) {
      setFullInvoiceDetails({ custom_fields: invoice.items.custom_fields, ...invoice })
    }

    // Fetch the full detailed document from Zoho Books
    const fetchDetails = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/get-invoice-details?targetId=${zohoId}&type=${type}`)
        const data = await res.json()
        if (data.success && (data.invoice || data.document)) {
          setFullInvoiceDetails(data.invoice || data.document)
        }
      } catch (e) {
        console.error("Failed to load full document details", e)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDetails()
  }, [zohoId, invoice, isString, type])

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

  // ── New Action Handlers ──

  const handleSendEmail = async () => {
    const docLabel = type === 'Quote' ? 'quote' : type === 'SalesOrder' ? 'sales order' : 'invoice'
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
    if (!confirm(`⚠️ Are you sure you want to VOID this ${docLabel}? This action cannot be easily undone.`)) return
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
    const invoiceNumber = displayData?.invoice_number || displayData?.items?.invoiceNumber || displayData?.invoiceNumber
    if (!invoiceNumber && !zohoId) return
    if (!confirm(`Calculate and write all costs, profit, and commission fields for this invoice?`)) return
    setActionLoading("process-costs")
    try {
      const res = await fetch("/api/process-invoice-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: invoiceNumber,
          invoiceId: !invoiceNumber ? zohoId : undefined
        })
      })
      const data = await res.json()
      if (data.success) {
        const inv = data.invoice
        alert(
          `✅ Invoice ${inv.invoiceNumber} processed!\n\n` +
          `Sub Total: $${inv.subTotal.toFixed(2)}\n` +
          `Dead Cost (VIG): $${inv.deadCostSubjectToVig.toFixed(2)}\n` +
          `Dead Cost (No VIG): $${inv.deadCostNoVig.toFixed(2)}\n` +
          `Dead Cost Total: $${inv.deadCostTotal.toFixed(2)}\n` +
          `VIG Rate: ${inv.vigRate}x\n` +
          `Dead Cost + VIG: $${inv.deadCostPlusVig.toFixed(2)}\n` +
          `Profit: $${inv.profit.toFixed(2)} (${inv.marginPercent}%)\n` +
          `Commission: $${inv.salesCommission.toFixed(2)} (${inv.commissionPercent}%)\n\n` +
          `${inv.fieldsUpdated} fields updated in Zoho Books.`
        )
        onClose()
      } else {
        alert(`Failed: ${data.error}`)
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading("")
    }
  }

  const typeColor = type === 'Quote' ? 'text-purple-400' : type === 'SalesOrder' ? 'text-blue-400' : 'text-amber-500'
  const typeLabel = type === 'Quote' ? 'Quote/Estimate' : type === 'SalesOrder' ? 'Sales Order' : 'Invoice'
  const statusLower = (displayData?.status || '').toLowerCase()
  const isVoided = statusLower === 'void' || statusLower === 'voided'
  const isPaid = statusLower === 'paid'
  const balanceDue = parseFloat(displayData?.balance || 0)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-fade-in">
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-neutral-900 border border-neutral-800 w-full max-w-6xl h-[85dvh] max-h-[calc(100dvh-2rem)] rounded-2xl overflow-hidden flex flex-col shadow-2xl z-[51] animate-scale-in">
        
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

        {/* ── Header ── */}
        <div className="bg-neutral-850 px-3 sm:px-6 py-3 sm:py-4 border-b border-neutral-800 flex justify-between items-center shrink-0 gap-2">
          <div className="min-w-0">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${typeColor}`}>
              <FiFileText className="shrink-0" /> <span className="truncate">{typeLabel} Details</span>
            </h2>
            <p className="text-[10px] text-neutral-400 mt-0.5 font-mono truncate">Zoho ID: {zohoId}</p>
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end shrink-0">
            
            {/* ── QUOTE ACTIONS ── */}
            {type === "Quote" && !isVoided && (
              <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 sm:p-1">
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
            
            {/* ── SALES ORDER ACTIONS ── */}
            {type === "SalesOrder" && !isVoided && (
              <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 sm:p-1">
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

            {/* ── INVOICE ACTIONS ── */}
            {type === "Invoice" && !isVoided && (
              <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 sm:p-1">
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

            {/* ── SHARED ACTIONS (all document types) ── */}
            <div className="flex items-center gap-1">
              {/* Process Costs (Invoice only) */}
              {type === "Invoice" && !isVoided && (
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

        {/* ── Content Split — Stacks vertically on mobile, side-by-side on lg+ ── */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          {/* Data View Panel */}
          <div className="w-full lg:w-[340px] xl:w-[380px] bg-neutral-950 border-b lg:border-b-0 lg:border-r border-neutral-800 overflow-y-auto p-4 sm:p-5 flex flex-col gap-5 shrink-0 max-h-[40vh] lg:max-h-none">
            <div>
              <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><FiDatabase className="text-sky-400 shrink-0" /> Data View</h3>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">{type === 'Quote' ? 'Quote' : type === 'SalesOrder' ? 'SO' : 'Invoice'} #</label>
                  <div className="text-sm text-white font-mono truncate">{displayData.items?.invoiceNumber || displayData.invoiceNumber || displayData.invoice_number || displayData.estimate_number || displayData.salesorder_number || displayData.id?.slice(-6) || "—"}</div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Amount</label>
                  <div className="text-sm text-emerald-400 font-bold">${parseFloat(displayData.amount || displayData.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Status</label>
                  <div className={`text-sm font-bold ${displayData.status === 'Paid' || displayData.status === 'paid' ? 'text-blue-400' : displayData.status === 'Overdue' || displayData.status === 'overdue' ? 'text-red-400' : isVoided ? 'text-neutral-500' : 'text-amber-400'}`}>{displayData.status || "—"}</div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Issue Date</label>
                  <div className="text-sm text-white">{displayData.issueDate || displayData.date ? new Date(displayData.issueDate || displayData.date).toLocaleDateString(undefined, { timeZone: 'UTC' }) : "—"}</div>
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
                {displayData.customer_name && (
                  <div>
                    <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Customer</label>
                    <div className="text-sm text-white font-semibold truncate">{displayData.customer_name}</div>
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
            </div>

            {/* Custom Fields & Line Items */}
            <div className="pt-3 border-t border-neutral-800 flex-1 overflow-y-auto pr-1">
              <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-3">Custom Fields & Data</h4>
              
              {isLoading ? (
                <div className="flex justify-center items-center py-8 gap-2 text-sm font-semibold text-neutral-400">
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  Loading details...
                </div>
              ) : (
                <>
                  {/* Line Items Section */}
                  {displayData?.line_items && displayData.line_items.length > 0 && (
                    <div className="mb-5">
                      <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Line Items</h4>
                      <div className="space-y-2">
                        {displayData.line_items.map((item: any, i: number) => (
                          <div key={item.line_item_id || i} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 shadow-sm">
                            <div className="flex justify-between gap-2 font-bold text-white text-sm">
                              <span className="truncate min-w-0">{item.name}</span>
                              <span className="text-emerald-400 shrink-0">${parseFloat(item.item_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-neutral-400">
                              {item.sku && <span>SKU: <span className="font-mono text-neutral-300">{item.sku}</span></span>}
                              {item.sku && item.vendor && <span>|</span>}
                              {item.vendor && <span>Vendor: <span className="font-semibold text-neutral-300">{item.vendor}</span></span>}
                              {(item.sku || item.vendor) && item.rate && <span>|</span>}
                              {item.rate && <span>Price: ${parseFloat(item.rate).toLocaleString()}</span>}
                              {(item.sku || item.vendor || item.rate) && item.cost && <span>|</span>}
                              {item.cost && <span>Cost: ${parseFloat(item.cost).toLocaleString()}</span>}
                              <span>|</span>
                              <span>Qty: {item.quantity}</span>
                            </div>
                            {item.description && <div className="text-xs text-neutral-500 mt-1 whitespace-pre-wrap line-clamp-3">{item.description}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom Fields Section */}
                  {displayData?.custom_fields ? (
                    <div className="flex flex-col gap-2 pb-4">
                  {displayData.custom_fields
                    .filter((f: any) => f.value && f.value !== "" && f.value !== false && f.value !== "false")
                    .map((field: any) => (
                    <div key={field.customfield_id || field.label} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 shadow-sm">
                      <label className="text-[10px] text-emerald-500/80 uppercase font-bold tracking-wider mb-1 block">
                        {field.label}
                      </label>
                      {field.data_type === "multiline" || String(field.value).includes("\n") ? (
                        <pre className="text-xs text-neutral-200 font-mono whitespace-pre-wrap break-all bg-neutral-950 p-2.5 rounded border border-neutral-800/50">
                          {field.value_formatted || field.value}
                        </pre>
                      ) : (
                        <div className={`text-sm font-bold ${field.data_type === "amount" || field.data_type === "percent" || field.label.includes("VIG") || field.label.includes("COST") || field.label.includes("COMMISSION") ? "text-emerald-400" : "text-white"}`}>
                          {field.value_formatted || field.value}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                    ) : (
                      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 overflow-x-auto">
                        <pre className="text-[10px] text-neutral-300 font-mono whitespace-pre-wrap break-all">
                          {JSON.stringify(displayData.items || displayData, null, 2)}
                        </pre>
                      </div>
                    )}
                </>
              )}
            </div>
          </div>

          {/* PDF Preview Panel */}
          <div className="flex-1 bg-neutral-900 p-2 sm:p-3 relative flex flex-col min-h-[300px]">
            <iframe
              src={`/api/get-invoice-pdf?id=${zohoId}&type=${type}`}
              className="w-full h-full border-0 rounded-xl bg-neutral-950 flex-1 shadow-inner"
              title={`${typeLabel} PDF Preview`}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
