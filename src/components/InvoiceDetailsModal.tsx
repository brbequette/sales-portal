"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { FiFileText, FiDatabase } from "react-icons/fi"

interface InvoiceDetailsModalProps {
  invoice: any | string; // Can be an invoice object or just the zohoId string
  onClose: () => void;
}

export function InvoiceDetailsModal({ invoice, onClose }: InvoiceDetailsModalProps) {
  const [fullInvoiceDetails, setFullInvoiceDetails] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)

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

    // Fetch the full detailed invoice from Zoho Books
    const fetchDetails = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/get-invoice-details?targetId=${zohoId}`)
        const data = await res.json()
        if (data.success && data.invoice) {
          setFullInvoiceDetails(data.invoice)
        }
      } catch (e) {
        console.error("Failed to load full invoice details", e)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDetails()
  }, [zohoId, invoice, isString])

  const displayData = fullInvoiceDetails || initialData

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-neutral-900 border border-neutral-850 w-full max-w-6xl h-[85vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl z-[10001]">
        {/* Header */}
        <div className="bg-neutral-850 px-6 py-4 border-b border-neutral-800 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <FiFileText className="text-amber-500" /> Invoice Details
            </h2>
            <p className="text-[10px] text-neutral-400 mt-0.5 font-mono">Zoho ID: {zohoId}</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`/api/get-invoice-pdf?id=${zohoId}&download=true`}
              target="_blank"
              rel="noreferrer"
              className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors border border-neutral-700 flex items-center gap-1.5 cursor-pointer"
            >
              Download PDF
            </a>
            <button 
              onClick={onClose} 
              className="text-neutral-400 hover:text-white p-1 bg-neutral-800 hover:bg-neutral-755 transition-colors rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg cursor-pointer"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Content Split */}
        <div className="flex flex-1 overflow-hidden">
          {/* Data View */}
          <div className="w-1/3 min-w-[300px] bg-neutral-950 border-r border-neutral-800 overflow-y-auto p-5 flex flex-col gap-6">
            <div>
              <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2"><FiDatabase className="text-sky-400" /> Data View</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Invoice #</label>
                  <div className="text-sm text-white font-mono">{displayData.items?.invoiceNumber || displayData.invoiceNumber || displayData.invoice_number || displayData.id?.slice(-6) || "—"}</div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Amount</label>
                  <div className="text-sm text-emerald-400 font-bold">${parseFloat(displayData.amount || displayData.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Status</label>
                  <div className={`text-sm font-bold ${displayData.status === 'Paid' ? 'text-blue-400' : 'text-amber-400'}`}>{displayData.status || "—"}</div>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Issue Date</label>
                  <div className="text-sm text-white">{displayData.issueDate || displayData.date ? new Date(displayData.issueDate || displayData.date).toLocaleDateString() : "—"}</div>
                </div>
                {displayData.salesperson_name && (
                  <div>
                    <label className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Salesperson</label>
                    <div className="text-sm text-white font-semibold">{displayData.salesperson_name}</div>
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
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-800 flex-1 overflow-y-auto pr-2">
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
                    <div className="mb-6">
                      <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-3">Line Items</h4>
                      <div className="space-y-2">
                        {displayData.line_items.map((item: any, i: number) => (
                          <div key={item.line_item_id || i} className="bg-neutral-850 border border-neutral-800 rounded-lg p-3 shadow-sm">
                            <div className="flex justify-between font-bold text-white text-sm">
                              <span>{item.name}</span>
                              <span className="text-emerald-400">${parseFloat(item.item_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
                            {item.description && <div className="text-xs text-neutral-500 mt-1 whitespace-pre-wrap">{item.description}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom Fields Section */}
                  {displayData?.custom_fields ? (
                    <div className="flex flex-col gap-2.5 pb-4">
                  {displayData.custom_fields
                    .filter((f: any) => f.value && f.value !== "" && f.value !== false && f.value !== "false")
                    .map((field: any) => (
                    <div key={field.customfield_id || field.label} className="bg-neutral-850 border border-neutral-800 rounded-lg p-3 shadow-sm">
                      <label className="text-[10px] text-emerald-500/80 uppercase font-bold tracking-wider mb-1.5 block">
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

          {/* PDF Preview */}
          <div className="flex-1 bg-neutral-900 p-3 relative flex flex-col">
            <iframe
              src={`/api/get-invoice-pdf?id=${zohoId}`}
              className="w-full h-full border-0 rounded-xl bg-neutral-950 flex-1 shadow-inner"
              title="Invoice PDF Preview"
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
