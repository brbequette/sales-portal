"use client"

import React from "react"
import { FiX, FiPackage, FiDollarSign, FiTag, FiCheckCircle, FiAlertCircle, FiInfo } from "react-icons/fi"

interface LineItemModalProps {
  item: any | null
  onClose: () => void
}

export function LineItemModal({ item, onClose }: LineItemModalProps) {
  if (!item) return null

  const name = item.name || item.item_name || "Line Item Details"
  const sku = item.sku || item.code || item.item_id || "N/A"
  const qty = parseFloat(item.quantity || 1)
  const rate = parseFloat(item.rate || item.price || 0)
  const cost = parseFloat(item.cost || item.purchase_rate || item.bck || 0)
  const itemTotal = qty * rate
  const deadCostTotal = qty * cost

  // Determine VIG & Gift status
  const isGift = !!(item.gift || item.giftItem)
  const isNoVig = !!(item.noVig || item.isNoVig || item.subjectToVig === false || item.subject_to_vig === false || isGift)
  const vigRate = parseFloat(item.vigRate || 1.3)
  const vigDC = isNoVig ? deadCostTotal : (deadCostTotal * vigRate)
  const lineProfit = itemTotal - (isNoVig ? deadCostTotal : vigDC)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-neutral-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FiPackage size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white max-w-xs truncate">{name}</h3>
              <p className="text-xs text-neutral-400 font-mono">SKU: {sku}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">Quantity & Rate</span>
              <div className="text-lg font-bold text-white flex items-baseline gap-1">
                {qty}x <span className="text-xs text-neutral-400 font-normal">@ ${rate.toFixed(2)}</span>
              </div>
              <span className="text-[11px] text-emerald-400 font-semibold mt-1 block">Line Revenue: ${itemTotal.toFixed(2)}</span>
            </div>

            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">Unit Cost & Dead Cost</span>
              <div className="text-lg font-bold text-amber-400">
                ${cost.toFixed(2)} <span className="text-xs text-neutral-400 font-normal">/ unit</span>
              </div>
              <span className="text-[11px] text-neutral-400 font-medium mt-1 block">Total Base DC: ${deadCostTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* VIG & Exemption Status */}
          <div className="p-4 rounded-xl bg-surface-2 border border-white/10 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                <FiTag className="text-purple-400" /> VIG Multiplier Status:
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                isNoVig 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                  : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              }`}>
                {isNoVig ? 'Exempt / No VIG' : `Subject to VIG (${vigRate}x)`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-white/10">
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase font-bold">VIG Dead Cost (DC):</span>
                <span className="font-bold text-neutral-200">${vigDC.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase font-bold">Est. Net Profit:</span>
                <span className={`font-bold ${lineProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ${lineProfit.toFixed(2)}
                </span>
              </div>
            </div>

            {isGift && (
              <div className="flex items-center gap-2 p-2 rounded bg-emerald-950/40 border border-emerald-800/40 text-[11px] text-emerald-300 font-medium">
                <FiCheckCircle size={14} /> Gift / Swag Item — Exempt from VIG deductions.
              </div>
            )}
          </div>

          {/* Item Description / Notes */}
          {item.description && (
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">Item Description</span>
              <p className="text-xs text-neutral-300 bg-black/30 p-3 rounded-xl border border-white/10 leading-relaxed font-sans">
                {item.description}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 border-t border-white/10 bg-surface-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-lg transition-colors border border-white/10"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  )
}
