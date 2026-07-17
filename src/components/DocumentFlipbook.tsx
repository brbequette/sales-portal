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

const getDocTypeParam = (tab: DocType): "Invoice" | "Quote" | "SalesOrder" => {
  if (tab === "invoices") return "Invoice"
  if (tab === "quotes") return "Quote"
  return "SalesOrder"
}

const getDocNumber = (doc: any, tab: DocType) => {
  if (tab === "invoices") return doc?.items?.invoiceNumber || doc?.items?.invoice_number || doc?.zohoId || doc?.id || "—";
  if (tab === "quotes") return doc?.items?.estimateNumber || doc?.items?.estimate_number || doc?.items?.quoteNumber || doc?.quoteNumber || doc?.zohoId || doc?.id || "—";
  return doc?.items?.salesOrderNumber || doc?.items?.salesorder_number || doc?.orderNumber || doc?.zohoId || doc?.id || "—";
}

interface DocumentFlipbookProps {
  invoices?: any[]
  quotes?: any[]
  salesOrders?: any[]
  onViewInvoice?: (zohoId: string) => void
  onViewSalesDoc?: (type: 'SalesOrder' | 'Quote', doc: any) => void
}

export function DocumentFlipbook({
  invoices = [],
  quotes = [],
  salesOrders = [],
  onViewInvoice,
  onViewSalesDoc
}: DocumentFlipbookProps) {
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
        <div className="flex bg-neutral-800 rounded-lg p-0.5 gap-0.5 overflow-x-auto flex-nowrap scrollbar-none">
          {(Object.keys(docConfig) as DocType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
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

          {/* Unified PDF Document Viewer */}
          <div className="space-y-3">
            {/* Actual PDF Container */}
            <div className="w-full h-[600px] bg-neutral-900 rounded-xl overflow-hidden shadow-2xl border border-neutral-800 relative group">
              <iframe
                src={`/api/get-invoice-pdf?id=${current.zohoId || current.id}&type=${getDocTypeParam(activeDoc)}`}
                className="w-full h-full border-0"
                title={`${cfg.label} PDF`}
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
                  {cfg.label.slice(0, -1)} #{getDocNumber(current, activeDoc)}
                </span>
                {activeDoc !== "invoices" && (
                  <button
                    onClick={() => {
                      const type = activeDoc === "quotes" ? "Quote" : "SalesOrder"
                      if (onViewSalesDoc) onViewSalesDoc(type, current)
                    }}
                    className="text-[10px] text-blue-400 hover:underline ml-2"
                  >
                    View Details Card
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white font-semibold transition-colors bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded-lg border border-neutral-800"
                >
                  <FiMaximize2 size={12} /> Full Screen
                </button>
                <a
                  href={`/api/get-invoice-pdf?id=${current.zohoId || current.id}&type=${getDocTypeParam(activeDoc)}&download=true`}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg border border-blue-500/20"
                >
                  <FiDownload /> Download PDF
                </a>
              </div>
            </div>
          </div>

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
      {isFullscreen && current && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col p-4 safe-top safe-bottom">
          {/* Fullscreen Header */}
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-3 shrink-0">
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColor(current?.status)}`}>
                {current?.status || "—"}
              </span>
              <h3 className="text-white font-bold text-sm sm:text-base">
                {cfg.label.slice(0, -1)} #{getDocNumber(current, activeDoc)}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/get-invoice-pdf?id=${current.zohoId || current.id}&type=${getDocTypeParam(activeDoc)}&download=true`}
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
              src={`/api/get-invoice-pdf?id=${current.zohoId || current.id}&type=${getDocTypeParam(activeDoc)}`}
              className="w-full h-full border-0"
              title={`${cfg.label} PDF Fullscreen`}
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
