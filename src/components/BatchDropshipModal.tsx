"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import {
  FiTruck,
  FiCheckCircle,
  FiAlertCircle,
  FiX,
  FiLoader,
  FiExternalLink,
  FiLayers,
  FiDollarSign,
  FiPackage,
  FiShield
} from "react-icons/fi"
import { toast } from "react-hot-toast"
import { getZohoBooksUrl } from "@/lib/zoho-urls"

interface BatchDropshipModalProps {
  salesOrderIds: string[]
  onClose: () => void
  onSuccess: () => void
}

export function BatchDropshipModal({ salesOrderIds, onClose, onSuccess }: BatchDropshipModalProps) {
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)
  const [executionResults, setExecutionResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch preview on mount
  useEffect(() => {
    let isMounted = true
    async function loadPreview() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/shipping/batch-dropship", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "preview",
            salesOrderIds
          })
        })
        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to load batch dropship preview")
        }
        if (isMounted) {
          setPreviewData(data)
        }
      } catch (err: any) {
        if (isMounted) setError(err.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadPreview()
    return () => { isMounted = false }
  }, [salesOrderIds])

  const handleExecuteDispatch = async () => {
    if (!previewData || previewData.readyGroupsCount === 0) {
      toast.error("No ready vendor groups to dispatch")
      return
    }

    setExecuting(true)
    setError(null)
    try {
      const res = await fetch("/api/shipping/batch-dropship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          salesOrderIds
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to execute batch dropship")
      }
      setExecutionResults(data)
      toast.success(`Successfully dispatched ${data.successCount} dropship POs!`)
      onSuccess()
    } catch (err: any) {
      setError(err.message)
      toast.error(`Execution failed: ${err.message}`)
    } finally {
      setExecuting(false)
    }
  }

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
              <FiLayers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Automated Batch Dropship Dispatcher
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-950 border border-orange-800 text-orange-400 font-mono font-medium">
                  {salesOrderIds.length} Orders Selected
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Auto-aggregate vendor line items, enforce dropship compliance, and dispatch Zoho Books POs in parallel.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={executing}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-neutral-300">
          
          {loading && (
            <div className="py-16 text-center space-y-3">
              <FiLoader className="w-8 h-8 text-orange-400 animate-spin mx-auto" />
              <p className="text-neutral-400">Analyzing orders, catalog vendors, and dropship policies...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-800/50 text-red-300 flex items-start gap-3">
              <FiAlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">Notice</p>
                <p className="text-xs text-red-200 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Execution Results View */}
          {executionResults && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/50 text-emerald-300 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FiCheckCircle className="w-6 h-6 text-emerald-400" />
                  <div>
                    <p className="font-bold text-white">Batch Dispatch Completed!</p>
                    <p className="text-xs text-emerald-200">
                      Dispatched {executionResults.successCount} of {executionResults.totalProcessed} vendor POs in {executionResults.durationMs}ms.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Created Purchase Orders</h3>
                <div className="space-y-2">
                  {executionResults.dispatches?.map((d: any, idx: number) => {
                    const poUrl = d.poId ? getZohoBooksUrl('purchaseorders', d.poId) : '#'
                    return (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-xl border flex items-center justify-between ${
                          d.success
                            ? "bg-neutral-950/80 border-neutral-800 text-neutral-200"
                            : "bg-red-950/30 border-red-800/50 text-red-200"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <FiTruck className={d.success ? "text-orange-400" : "text-red-400"} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{d.vendorName}</span>
                              <span className="text-xs text-neutral-400">for SO #{d.salesOrderNumber}</span>
                            </div>
                            {d.poNumber && (
                              <a
                                href={poUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-orange-400 font-mono font-bold hover:underline flex items-center gap-1 mt-0.5"
                              >
                                {d.poNumber} <FiExternalLink size={10} />
                              </a>
                            )}
                            {d.error && <p className="text-xs text-red-400 mt-0.5">{d.error}</p>}
                          </div>
                        </div>

                        {d.total > 0 && (
                          <span className="text-sm font-bold text-emerald-400 font-mono">
                            ${Number(d.total).toFixed(2)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Preview View (Before Execution) */}
          {!loading && !executionResults && previewData && (
            <div className="space-y-5">
              
              {/* Metric Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-neutral-950/80 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-xs text-neutral-400 flex items-center gap-1.5 mb-1">
                    <FiCheckCircle className="text-emerald-400" /> Ready to Dispatch
                  </span>
                  <div className="text-2xl font-black text-white font-mono">
                    {previewData.readyGroupsCount} <span className="text-xs font-normal text-neutral-500">vendor POs</span>
                  </div>
                </div>

                <div className="bg-neutral-950/80 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-xs text-neutral-400 flex items-center gap-1.5 mb-1">
                    <FiDollarSign className="text-emerald-400" /> Est. PO Subtotal
                  </span>
                  <div className="text-2xl font-black text-emerald-400 font-mono">
                    ${Number(previewData.totalEstimatedCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="bg-neutral-950/80 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-xs text-neutral-400 flex items-center gap-1.5 mb-1">
                    <FiShield className="text-amber-400" /> Policy Blocked / Unassigned
                  </span>
                  <div className="text-2xl font-black text-amber-400 font-mono">
                    {previewData.blockedGroupsCount} <span className="text-xs font-normal text-neutral-500">withheld</span>
                  </div>
                </div>
              </div>

              {/* Ready Groups Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                    <FiCheckCircle className="text-emerald-400" /> Ready for Automated PO Dispatch ({previewData.readyGroups.length})
                  </h3>
                  <span className="text-xs text-neutral-500">Grouped by Vendor</span>
                </div>

                {previewData.readyGroups.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border border-neutral-800 bg-neutral-950/40 text-neutral-500">
                    No eligible dropship items ready for automated dispatch. Check item vendor assignments or policies below.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {previewData.readyGroups.map((g: any, idx: number) => (
                      <div key={idx} className="bg-neutral-950/80 border border-neutral-800/80 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-neutral-800/60">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-950 border border-orange-800 text-orange-300 font-mono">
                              SO #{g.salesOrderNumber}
                            </span>
                            <span className="font-bold text-white">{g.vendorName}</span>
                            <span className="text-xs text-neutral-400">· {g.customerName} ({g.destination})</span>
                          </div>
                          <span className="text-xs font-bold text-emerald-400 font-mono">
                            Est. ${Number(g.totalEstimatedCost).toFixed(2)}
                          </span>
                        </div>

                        {/* Line items list */}
                        <div className="space-y-1.5 pl-2 border-l-2 border-orange-500/30">
                          {g.items.map((item: any, iIdx: number) => (
                            <div key={iIdx} className="flex items-center justify-between text-xs">
                              <span className="text-neutral-300">
                                <span className="font-mono text-orange-400 font-bold">{item.quantity}x</span> {item.name}
                              </span>
                              <span className="text-neutral-500 font-mono">
                                @ ${Number(item.unitCost).toFixed(2)} ea
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Policy Blocked / Withheld Section */}
              {previewData.blockedGroups.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <FiShield className="text-amber-400" /> Withheld by Policy or Missing Vendor ({previewData.blockedGroups.length})
                  </h3>
                  <div className="space-y-2">
                    {previewData.blockedGroups.map((bg: any, idx: number) => (
                      <div key={idx} className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-3.5 flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs font-bold text-amber-300">SO #{bg.salesOrderNumber}</span>
                            <span className="text-xs font-semibold text-white">{bg.vendorName}</span>
                            <span className="text-xs text-neutral-400">· {bg.customerName}</span>
                          </div>
                          <p className="text-xs text-amber-400/90 font-medium">⚠️ {bg.blockReason}</p>
                          <div className="text-[11px] text-neutral-400 mt-1">
                            Items: {bg.items.map((it: any) => `${it.quantity}x ${it.name}`).join(", ")}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-400 shrink-0">
                          Held for Hub Ship
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={executing}
            className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors text-xs font-semibold"
          >
            {executionResults ? "Done" : "Cancel"}
          </button>

          {!executionResults && (
            <button
              onClick={handleExecuteDispatch}
              disabled={loading || executing || !previewData || previewData.readyGroupsCount === 0}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg ${
                loading || executing || !previewData || previewData.readyGroupsCount === 0
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700"
                  : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white border border-orange-400/30 shadow-orange-500/20"
              }`}
            >
              {executing ? (
                <>
                  <FiLoader className="w-4 h-4 animate-spin" />
                  Dispatching {previewData?.readyGroupsCount} Dropship POs...
                </>
              ) : (
                <>
                  <FiTruck className="w-4 h-4" />
                  Dispatch All Ready Dropships ({previewData?.readyGroupsCount || 0})
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  )

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : null
}
