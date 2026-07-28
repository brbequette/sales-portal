"use client"

import React, { useState } from "react"
import { FiX, FiFileText, FiDollarSign, FiInfo, FiExternalLink, FiChevronRight } from "react-icons/fi"
import { LineItemModal } from "./LineItemModal"

interface KpiBreakdownModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  formula: string
  documents: any[]
}

export function KpiBreakdownModal({ isOpen, onClose, title, formula, documents }: KpiBreakdownModalProps) {
  const [selectedLineItem, setSelectedLineItem] = useState<any | null>(null)

  if (!isOpen) return null

  const totalAmount = documents.reduce((sum, doc) => sum + (parseFloat(doc.amount || doc.sub_total || 0)), 0)
  const totalProfit = documents.reduce((sum, doc) => sum + (parseFloat(doc.profit || 0)), 0)

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
        <div className="relative w-full max-w-4xl max-h-[85vh] bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-100">
          
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#161922]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <FiDollarSign size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{title}</h3>
                <p className="text-xs text-neutral-400 font-mono flex items-center gap-1 mt-0.5">
                  <FiInfo className="text-emerald-400" /> Formula: {formula}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <FiX size={20} />
            </button>
          </div>

          {/* Summary Strip */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-black/40 border-b border-white/10 text-center">
            <div className="p-2.5 rounded-xl bg-[#161922] border border-white/5">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Total Documents</span>
              <span className="text-base font-black text-white">{documents.length}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#161922] border border-white/5">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Derived Total Revenue</span>
              <span className="text-base font-black text-emerald-400">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#161922] border border-white/5">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Derived Net Profit</span>
              <span className="text-base font-black text-purple-400">${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Document Table */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {documents.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 text-sm font-semibold">
                No underlying documents found for this calculation.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#161922] text-neutral-400 font-bold uppercase tracking-wider text-[10px] border-b border-white/10">
                    <tr>
                      <th className="p-3">Doc #</th>
                      <th className="p-3">Customer / Account</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Subtotal ($)</th>
                      <th className="p-3 text-right">Dead Cost ($)</th>
                      <th className="p-3 text-right">Est. Profit ($)</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-black/20">
                    {documents.map((doc: any, i: number) => {
                      const docNum = doc.invoiceNumber || doc.salesorder_number || doc.zohoId || `Doc #${i+1}`
                      const docDate = doc.issueDate || doc.date || doc.orderDate || doc.createdAt
                      const lineItems = doc.lineItems || doc.line_items || []
                      
                      return (
                        <React.Fragment key={doc.id || i}>
                          <tr className="hover:bg-white/[0.04] transition-colors group">
                            <td className="p-3 font-mono font-bold text-white flex items-center gap-1.5">
                              <FiFileText className="text-blue-400 shrink-0" />
                              <span>{docNum}</span>
                            </td>
                            <td className="p-3 text-neutral-300 font-semibold max-w-xs truncate">
                              {doc.accountName || doc.account?.name || doc.customer_name || "Unknown"}
                            </td>
                            <td className="p-3 text-neutral-400 font-mono text-[11px]">
                              {docDate ? new Date(docDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-"}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-white">
                              ${(doc.amount || doc.sub_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="p-3 text-right font-mono text-amber-400">
                              ${(doc.deadCost || doc.deadCostTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-400">
                              ${(doc.profit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 text-[10px] rounded uppercase font-bold bg-neutral-800 text-neutral-300 border border-white/10">
                                {doc.status || "Completed"}
                              </span>
                            </td>
                          </tr>

                          {/* Clickable Line Items Breakdown */}
                          {lineItems.length > 0 && (
                            <tr className="bg-black/40">
                              <td colSpan={7} className="p-3 pl-8">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Line Items (Click for full item popup):</div>
                                <div className="flex flex-wrap gap-2">
                                  {lineItems.map((li: any, idx: number) => (
                                    <button
                                      key={idx}
                                      onClick={() => setSelectedLineItem(li)}
                                      className="px-2.5 py-1 bg-[#161922] hover:bg-neutral-800 text-neutral-200 text-[11px] font-medium rounded-lg border border-white/10 transition-colors flex items-center gap-1.5"
                                    >
                                      <span className="font-bold text-emerald-400">{li.quantity || 1}x</span>
                                      <span>{li.name || li.sku}</span>
                                      <span className="text-neutral-500">(${parseFloat(li.rate || 0).toFixed(2)})</span>
                                      <FiChevronRight size={12} className="text-neutral-500" />
                                    </button>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex justify-end px-6 py-3 border-t border-white/10 bg-[#161922]">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-lg transition-colors border border-white/10"
            >
              Close Breakdown
            </button>
          </div>
        </div>
      </div>

      {/* Render LineItemModal if a line item is clicked */}
      {selectedLineItem && (
        <LineItemModal item={selectedLineItem} onClose={() => setSelectedLineItem(null)} />
      )}
    </>
  )
}
