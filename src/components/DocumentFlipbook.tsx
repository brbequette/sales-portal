"use client"

import { useState } from "react"
import { FiFileText, FiChevronLeft, FiChevronRight, FiDownload, FiMaximize2, FiMinimize2 } from "react-icons/fi"

type DocType = "invoices" | "quotes" | "salesOrders"

const docConfig: Record<DocType, { label: string; color: string; idField: string; dateField: string; amountField: string }> = {
  invoices: { label: "Invoices", color: "blue", idField: "zohoId", dateField: "issueDate", amountField: "amount" },
  quotes: { label: "Quotes", color: "purple", amountField: "amount", idField: "id", dateField: "createdAt" },
  salesOrders: { label: "Sales Orders", color: "emerald", amountField: "amount", idField: "id", dateField: "orderDate" },
}

function statusColor(status: string) {
  if (!status) return "bg-gray-100 text-gray-700"
  const s = status.toLowerCase()
  if (s === "paid" || s === "accepted" || s === "processed" || s === "shipped") return "bg-green-100 text-green-800"
  if (s === "overdue" || s === "rejected") return "bg-red-100 text-red-800"
  if (s === "sent" || s === "pending") return "bg-yellow-100 text-yellow-800"
  return "bg-gray-100 text-gray-700"
}

export function DocumentFlipbook({
  invoices = [],
  quotes = [],
  salesOrders = [],
}: {
  invoices?: any[]
  quotes?: any[]
  salesOrders?: any[]
}) {
  const [activeDoc, setActiveDoc] = useState<DocType>("invoices")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const docSets: Record<DocType, any[]> = { invoices, quotes, salesOrders }
  const docs = docSets[activeDoc]
  const cfg = docConfig[activeDoc]
  const current = docs[currentIndex]

  const switchTab = (tab: DocType) => {
    setActiveDoc(tab)
    setCurrentIndex(0)
  }

  const totalValue = docs.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0)

  return (
    <div className="space-y-3">
      {/* Header + Tabs */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FiFileText className="text-blue-400" /> Document Flipbook
        </h2>
        <div className="flex bg-neutral-800 rounded-lg p-0.5 gap-0.5">
          {(Object.keys(docConfig) as DocType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                activeDoc === tab ? "bg-neutral-600 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              {docConfig[tab].label}
              <span className="ml-1 text-[10px] opacity-60">({docSets[tab].length})</span>
            </button>
          ))}
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="text-center py-8 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
          <FiFileText className="mx-auto text-3xl mb-2 text-neutral-700" />
          <p className="text-sm">No {cfg.label.toLowerCase()} on record.</p>
        </div>
      ) : (
        <>
          {/* Summary Strip */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-neutral-800/50 rounded-lg py-2">
              <div className="text-xs text-neutral-500">Total</div>
              <div className="text-sm font-bold text-white">{docs.length}</div>
            </div>
            <div className="bg-neutral-800/50 rounded-lg py-2">
              <div className="text-xs text-neutral-500">Combined</div>
              <div className="text-sm font-bold text-emerald-400">${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="bg-neutral-800/50 rounded-lg py-2">
              <div className="text-xs text-neutral-500">Avg</div>
              <div className="text-sm font-bold text-blue-400">${docs.length ? (totalValue / docs.length).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}</div>
            </div>
          </div>

          {/* Document Card or PDF Viewer */}
          {activeDoc === "invoices" ? (
            <div className="space-y-3">
              {/* Actual PDF Container */}
              <div className="w-full h-[600px] bg-neutral-900 rounded-xl overflow-hidden shadow-2xl border border-neutral-800 relative group">
                <iframe
                  src={`/api/get-invoice-pdf?id=${current.zohoId}`}
                  className="w-full h-full border-0"
                  title={`Invoice PDF`}
                />
                
                {/* Maximize Button overlayed at the top right of the PDF */}
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="absolute top-4 right-4 bg-neutral-950/80 hover:bg-neutral-950 text-neutral-300 hover:text-white p-2.5 rounded-xl border border-neutral-800 shadow-xl transition-all hover:scale-105"
                  title="Expand to Full Screen"
                >
                  <FiMaximize2 size={16} />
                </button>
              </div>

              {/* Download / Status Footer */}
              <div className="flex justify-between items-center bg-neutral-900/50 p-3 rounded-lg border border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColor(current?.status)}`}>
                    {current?.status || "—"}
                  </span>
                  <span className="text-xs text-neutral-400">
                    Invoice #{current?.items?.invoiceNumber || current?.zohoId?.slice(-6).toUpperCase() || "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsFullscreen(true)}
                    className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white font-semibold transition-colors bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded-lg border border-neutral-800"
                  >
                    <FiMaximize2 size={12} /> Full Screen
                  </button>
                  <a
                    href={`/api/get-invoice-pdf?id=${current.zohoId}&download=true`}
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg border border-blue-500/20"
                  >
                    <FiDownload /> Download PDF
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white text-gray-900 rounded-xl shadow-2xl overflow-hidden">
              {/* Doc Header */}
              <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-5 py-4 flex justify-between items-start">
                <div>
                  <div className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">Titan Diamond</div>
                  <div className="text-white font-bold text-lg">
                    {cfg.label.slice(0, -1)} #{current?.[cfg.idField]?.slice(-6) || current?.id?.slice(-6) || "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-xs font-bold px-2 py-1 rounded-full inline-block ${statusColor(current?.status)}`}>
                    {current?.status || "—"}
                  </div>
                  <div className="text-blue-200 text-xs mt-1">
                    {currentIndex + 1} / {docs.length}
                  </div>
                </div>
              </div>

              {/* Doc Body */}
              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-gray-400 text-xs uppercase font-semibold mb-0.5">Date</div>
                    <div className="font-medium">
                      {current?.[cfg.dateField] ? new Date(current[cfg.dateField]).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  {activeDoc === "quotes" && (
                    <div>
                      <div className="text-gray-400 text-xs uppercase font-semibold mb-0.5">Valid Until</div>
                      <div className="font-medium">{current?.validUntil ? new Date(current.validUntil).toLocaleDateString() : "—"}</div>
                    </div>
                  )}
                </div>

                {/* Line Items */}
                <div className="border-t border-gray-100 pt-3">
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Line Items</div>
                  <div className="space-y-1 max-h-24 overflow-y-auto scrollbar-thin">
                    {Array.isArray(current?.items) && current.items.length > 0 ? (
                      current.items.map((item: any, i: number) => (
                        <div key={i} className="text-xs text-gray-700 flex justify-between">
                          <span>{typeof item === "string" ? item : item.name || JSON.stringify(item)}</span>
                          {item.amount && <span className="font-medium">${item.amount}</span>}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-gray-400 italic">Standard product assortment</div>
                    )}
                  </div>
                </div>

                {/* Total */}
                <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-500">Total Amount</span>
                  <span className="text-2xl font-bold text-blue-900">${parseFloat(current?.amount || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white disabled:opacity-30 transition-colors bg-neutral-800 px-3 py-2 rounded-lg"
            >
              <FiChevronLeft /> Previous
            </button>
            <div className="flex gap-1">
              {docs.slice(0, 8).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === currentIndex ? "bg-blue-500" : "bg-neutral-700 hover:bg-neutral-500"
                  }`}
                />
              ))}
              {docs.length > 8 && <span className="text-xs text-neutral-500 ml-1">+{docs.length - 8}</span>}
            </div>
            <button
              onClick={() => setCurrentIndex(Math.min(docs.length - 1, currentIndex + 1))}
              disabled={currentIndex === docs.length - 1}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white disabled:opacity-30 transition-colors bg-neutral-800 px-3 py-2 rounded-lg"
            >
              Next <FiChevronRight />
            </button>
          </div>
        </>
      )}

      {/* Immersive Fullscreen PDF Modal Viewer */}
      {isFullscreen && activeDoc === "invoices" && current && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col p-4 safe-top safe-bottom">
          {/* Fullscreen Header */}
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-3 shrink-0">
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColor(current?.status)}`}>
                {current?.status || "—"}
              </span>
              <h3 className="text-white font-bold text-sm sm:text-base">
                Invoice #{current?.items?.invoiceNumber || current?.zohoId?.slice(-6).toUpperCase() || "—"}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/get-invoice-pdf?id=${current.zohoId}&download=true`}
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg border border-blue-500/20 transition-all"
              >
                <FiDownload /> Download
              </a>
              <button
                onClick={() => setIsFullscreen(false)}
                className="bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white p-2 rounded-lg border border-neutral-800 transition-all"
                title="Exit Full Screen"
              >
                <FiMinimize2 size={16} />
              </button>
            </div>
          </div>

          {/* Fullscreen Body */}
          <div className="flex-1 w-full bg-neutral-950 rounded-xl overflow-hidden border border-neutral-800 relative">
            <iframe
              src={`/api/get-invoice-pdf?id=${current.zohoId}`}
              className="w-full h-full border-0"
              title={`Invoice PDF Fullscreen`}
            />
          </div>

          {/* Fullscreen Navigation Footer */}
          <div className="flex items-center justify-between pt-3 mt-1 shrink-0">
            <button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white disabled:opacity-30 transition-colors bg-neutral-900 border border-neutral-800 px-3 py-2 rounded-lg"
            >
              <FiChevronLeft /> Previous
            </button>
            <div className="text-xs text-neutral-500 font-medium">
              Document {currentIndex + 1} of {docs.length}
            </div>
            <button
              onClick={() => setCurrentIndex(Math.min(docs.length - 1, currentIndex + 1))}
              disabled={currentIndex === docs.length - 1}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white disabled:opacity-30 transition-colors bg-neutral-900 border border-neutral-800 px-3 py-2 rounded-lg"
            >
              Next <FiChevronRight />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
