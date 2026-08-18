"use client"

import React, { useState } from "react"
import { FiX, FiInfo, FiDatabase, FiCheckCircle, FiHelpCircle, FiPieChart, FiChevronDown, FiChevronUp, FiFileText } from "react-icons/fi"

export interface MetricDerivationInfo {
  title: string
  value: string | number
  subtitle?: string
  color?: string
  formula: string
  explanation: string
  dataSource: string
  calculationDetails: Array<{ label: string; value: string | number; description?: string }>
  notes?: string
  documents?: any[]
}

interface MetricDerivationModalProps {
  info: MetricDerivationInfo | null
  onClose: () => void
}

export function MetricDerivationModal({ info, onClose }: MetricDerivationModalProps) {
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(true)

  // Prevent background scrolling while the modal is open
  React.useEffect(() => {
    if (info) {
      document.body.style.overflow = "hidden"
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [info])

  if (!info) return null

  const themeColor = info.color || "#f97316"

  return (
    <div 
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-neutral-900/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center border"
              style={{ backgroundColor: `${themeColor}15`, borderColor: `${themeColor}30`, color: themeColor }}
            >
              <FiPieChart className="text-xl" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-tight">{info.title}</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-neutral-300">
                  Derivation Formula
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">{info.subtitle || "How this metric is calculated in real-time"}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <FiX className="text-lg" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 min-h-0">
          {/* Current Value Hero */}
          <div 
            className="p-5 rounded-xl border flex items-center justify-between"
            style={{ backgroundColor: `${themeColor}08`, borderColor: `${themeColor}20` }}
          >
            <div>
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Current Value</span>
              <div className="text-3xl font-black text-white mt-1">{info.value}</div>
            </div>
            <div 
              className="px-3 py-1.5 rounded-lg text-xs font-bold border"
              style={{ backgroundColor: `${themeColor}15`, borderColor: `${themeColor}30`, color: themeColor }}
            >
              Verified Calculation
            </div>
          </div>

          {/* Formula Box */}
          <div>
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FiHelpCircle className="text-amber-400" /> Calculation Formula
            </h3>
            <div className="bg-black/40 border border-white/10 rounded-xl p-4 font-mono text-sm text-emerald-400 break-words shadow-inner">
              {info.formula}
            </div>
          </div>

          {/* Explanation */}
          <div>
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FiInfo className="text-blue-400" /> Business Logic Explanation
            </h3>
            <p className="text-sm text-neutral-300 leading-relaxed bg-neutral-950/40 p-4 rounded-xl border border-white/5">
              {info.explanation}
            </p>
          </div>

          {/* Component Breakdown Table */}
          {info.calculationDetails && info.calculationDetails.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setIsBreakdownExpanded(!isBreakdownExpanded)}
                className="w-full flex items-center justify-between text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1 flex items-center gap-1.5 focus:outline-none hover:text-white transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <FiCheckCircle className="text-emerald-400" />
                  <span>Component Breakdown</span>
                </span>
                <span className="flex items-center gap-1 text-[10px] text-neutral-500 font-sans uppercase font-bold">
                  {isBreakdownExpanded ? "Collapse" : "Expand"}
                  {isBreakdownExpanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                </span>
              </button>

              {isBreakdownExpanded && (
                <div className="border border-white/10 rounded-xl overflow-hidden bg-black/20 p-4 space-y-4 transition-all duration-300 animate-slide-down">
                  <div className="divide-y divide-white/10 border border-white/5 rounded-lg overflow-hidden bg-black/10">
                    {info.calculationDetails.map((detail, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 text-sm hover:bg-white/[0.02] transition-colors">
                        <div>
                          <span className="font-semibold text-white">{detail.label}</span>
                          {detail.description && (
                            <p className="text-xs text-neutral-500 mt-0.5">{detail.description}</p>
                          )}
                        </div>
                        <span className="font-bold text-neutral-200 font-mono">{detail.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Contributing Documents List */}
                  {info.documents && info.documents.length > 0 && (
                    <div className="pt-3 border-t border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                          <FiFileText className="text-sky-400" />
                          <span>Contributing Documents ({info.documents.length})</span>
                        </span>
                        <span className="text-[10px] text-neutral-500 font-medium">
                          Invoices and orders making up sum
                        </span>
                      </div>
                      
                      <div className="border border-white/5 rounded-xl overflow-hidden bg-background max-h-56 overflow-y-auto pr-1">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-white/[0.03] border-b border-white/5 text-[9px] font-bold uppercase tracking-wider text-neutral-500">
                              <th className="p-2.5 font-semibold">Doc Number</th>
                              <th className="p-2.5 font-semibold">Date</th>
                              <th className="p-2.5 font-semibold">Client Name</th>
                              <th className="p-2.5 font-semibold text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 font-mono">
                            {info.documents.map((doc, idx) => {
                              const docNum = doc.invoiceNumber || doc.invoice_number || doc.salesorder_number || doc.zohoId || `Doc #${idx + 1}`
                              const docDate = doc.date || doc.issueDate || doc.orderDate || doc.createdAt
                              const docAmount = parseFloat(doc.amount || doc.sub_total || doc.total || 0)
                              const customerName = doc.accountName || doc.account?.name || doc.customer_name || "Unknown Client"
                              
                              return (
                                <tr key={doc.id || idx} className="hover:bg-white/[0.02] transition-colors">
                                  <td className="p-2.5 text-emerald-400 font-bold font-mono">
                                    {docNum}
                                  </td>
                                  <td className="p-2.5 text-neutral-400 font-sans">
                                    {docDate ? new Date(docDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: '2-digit'}) : '-'}
                                  </td>
                                  <td className="p-2.5 text-neutral-300 font-sans truncate max-w-[150px]" title={customerName}>
                                    {customerName}
                                  </td>
                                  <td className="p-2.5 text-right text-white font-bold">
                                    ${docAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Data Source Footnote */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/10 text-xs text-neutral-500">
            <FiDatabase className="text-neutral-400" />
            <span>Data Source: <strong className="text-neutral-300">{info.dataSource}</strong></span>
          </div>

          {info.notes && (
            <div className="text-xs text-neutral-400 italic bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              💡 {info.notes}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-sm rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
