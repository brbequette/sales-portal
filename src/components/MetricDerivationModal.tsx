"use client"

import React from "react"
import { FiX, FiInfo, FiDatabase, FiCheckCircle, FiHelpCircle, FiPieChart } from "react-icons/fi"

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
}

interface MetricDerivationModalProps {
  info: MetricDerivationInfo | null
  onClose: () => void
}

export function MetricDerivationModal({ info, onClose }: MetricDerivationModalProps) {
  if (!info) return null

  const themeColor = info.color || "#f97316"

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-2xl bg-neutral-900/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-up"
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
        <div className="p-6 overflow-y-auto space-y-6">
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
            <div>
              <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <FiCheckCircle className="text-emerald-400" /> Component Breakdown
              </h3>
              <div className="border border-white/10 rounded-xl overflow-hidden bg-black/20">
                <div className="divide-y divide-white/10">
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
              </div>
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
