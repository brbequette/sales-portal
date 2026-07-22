"use client"

import React, { useState } from "react"
import { 
  FiDollarSign, FiArrowRight, FiPercent, FiTrendingUp, 
  FiShield, FiTag, FiCreditCard, FiHelpCircle, FiChevronDown, FiChevronUp, FiCheckCircle
} from "react-icons/fi"

export interface InvoiceFinancialBreakdownProps {
  subTotal: number
  deadCostSubjectToVig?: number
  deadCostNoVig?: number
  deadCostTotal?: number
  vigRate?: number
  deadCostPlusVig?: number
  ccFees?: number
  additionalCosts?: number
  profit?: number
  marginPercent?: number
  commissionPct?: number
  salesCommission?: number
  salespersonName?: string
  lineItemDetails?: Array<{
    name: string
    quantity: number
    rate: number
    cost?: number
    deadCost?: number
    noVig?: boolean
    gift?: boolean
  }>
  customFields?: Array<{ label: string; value: any }>
}

export function InvoiceFinancialBreakdown({
  subTotal = 0,
  deadCostSubjectToVig,
  deadCostNoVig = 0,
  deadCostTotal,
  vigRate,
  deadCostPlusVig,
  ccFees = 0,
  additionalCosts = 0,
  profit,
  marginPercent,
  commissionPct = 50,
  salesCommission,
  salespersonName = "",
  lineItemDetails = [],
  customFields = []
}: InvoiceFinancialBreakdownProps) {
  const [showItemBreakdown, setShowItemBreakdown] = useState(false)

  // Extract exact custom field by label name (strict match to avoid matching PROFIT MARGIN % as PROFIT)
  const getCustomField = (keyStr: string): number | null => {
    const targetKey = keyStr.toUpperCase()
    const found = customFields?.find((f) => {
      const label = (f.label || "").toUpperCase().trim()
      return label === targetKey || label === `${targetKey} ($)` || label === `RECALCULATED ${targetKey}`
    })
    if (found && found.value != null && !isNaN(parseFloat(found.value))) {
      return parseFloat(found.value)
    }
    return null
  }

  const isMontgomery = salespersonName.toLowerCase().includes("montgomery") || salespersonName.toLowerCase().includes("morgan")
  
  // Resolve VIG Rate (1.0 for Montgomery Morgan, custom field fallback, or default 1.3)
  const resolvedVigRate = isMontgomery ? 1.0 : (vigRate && vigRate > 0 ? vigRate : (getCustomField("SALESPERSON VIG") || 1.3))
  
  // Calculate line item cost sum if available
  const lineItemDeadCostSum = lineItemDetails.reduce((sum, item) => {
    if (item.deadCost && item.deadCost > 0) return sum + item.deadCost
    // If deadCost is 0 on item, fallback to standard 60% of item rate * qty
    return sum + (item.quantity * item.rate * 0.6)
  }, 0)

  // Resolve Costs
  const resolvedDeadCostSubject = (deadCostSubjectToVig != null && !isNaN(deadCostSubjectToVig) && deadCostSubjectToVig > 0)
    ? deadCostSubjectToVig
    : (getCustomField("DEAD COST SUBJECT TO VIG") || getCustomField("DEAD COST TOTAL") || (deadCostTotal != null && !isNaN(deadCostTotal) && deadCostTotal > 0 ? deadCostTotal : (lineItemDeadCostSum > 0 ? lineItemDeadCostSum : (subTotal * 0.6))))
  
  // Calculate Dead Cost + VIG directly from Subject Cost × VIG Multiplier
  const resolvedDeadCostPlusVig = (resolvedDeadCostSubject * resolvedVigRate) + (deadCostNoVig || 0)
  
  // Net Profit MUST ALWAYS be mathematically derived as: Subtotal - (Dead Cost + VIG) - CC Fees - Additional Costs
  const calculatedProfit = subTotal - resolvedDeadCostPlusVig - ccFees - additionalCosts
  const resolvedProfit = (subTotal > 0 && !isNaN(calculatedProfit)) ? calculatedProfit : 0
  const resolvedMargin = subTotal > 0 ? (resolvedProfit / subTotal) * 100 : 0
  
  const resolvedCommissionPct = (commissionPct && commissionPct > 0) ? commissionPct : (getCustomField("COMMISSION FROM PROFIT") || 50)
  const resolvedCommission = (salesCommission && salesCommission > 0)
    ? salesCommission
    : (resolvedProfit > 0 ? resolvedProfit * (resolvedCommissionPct / 100) : 0)

  return (
    <div className="glass-panel border border-white/10 rounded-2xl p-5 bg-neutral-900/80 text-white space-y-6 shadow-xl">
      {/* Header Title */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <FiTrendingUp className="text-emerald-400" /> Invoice & Commission Derivation
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Live Calculation Breakdown
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Visual step-by-step breakdown showing how Net Profit and Payout Commission were derived.
          </p>
        </div>
        {salespersonName && (
          <div className="text-right">
            <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider block">Salesperson</span>
            <span className="text-xs font-bold text-white bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg inline-block">
              {salespersonName} {isMontgomery ? " (1.0 VIG Enforced)" : ""}
            </span>
          </div>
        )}
      </div>

      {/* ─── VISUAL FLOW DIAGRAM ─── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
        {/* Step 1: Subtotal */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center flex flex-col justify-between">
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">1. Subtotal</span>
          <div className="my-2">
            <span className="text-xl font-black text-white">${subTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <span className="text-[10px] text-neutral-400">Gross Sales</span>
        </div>

        {/* Step 2: Dead Cost + VIG */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center flex flex-col justify-between">
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">2. Cost + VIG</span>
          <div className="my-2">
            <span className="text-xl font-black text-white">${resolvedDeadCostPlusVig.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <span className="text-[10px] text-neutral-400">Base Cost × {resolvedVigRate}x VIG</span>
        </div>

        {/* Step 3: Fees */}
        <div className="bg-neutral-800/80 border border-white/10 rounded-xl p-3 text-center flex flex-col justify-between">
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">3. Fees & Deductions</span>
          <div className="my-2">
            <span className="text-xl font-black text-white">${(ccFees + additionalCosts).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <span className="text-[10px] text-neutral-400">CC Fees & Extra Costs</span>
        </div>

        {/* Step 4: Net Profit */}
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-center flex flex-col justify-between">
          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">4. Net Profit</span>
          <div className="my-2">
            <span className="text-xl font-black text-purple-300">${resolvedProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <span className="text-[10px] text-purple-400/80 font-bold">{resolvedMargin.toFixed(1)}% Margin</span>
        </div>

        {/* Step 5: Commission */}
        <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-3 text-center flex flex-col justify-between shadow-lg shadow-emerald-950/40">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">5. Commission</span>
          <div className="my-2">
            <span className="text-xl font-black text-emerald-400">${resolvedCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <span className="text-[10px] text-emerald-400/80 font-bold">{resolvedCommissionPct}% of Profit</span>
        </div>
      </div>

      {/* ─── DETAILED MATHEMATICAL STEP-BY-STEP TABLE ─── */}
      <div className="bg-black/30 border border-white/10 rounded-xl overflow-hidden text-xs">
        <div className="p-3 bg-white/[0.03] border-b border-white/10 font-bold text-neutral-300 flex justify-between items-center">
          <span>Mathematical Calculation Breakdown</span>
          <span className="text-[10px] text-neutral-500 font-mono">Formula Audit Trail</span>
        </div>

        <div className="divide-y divide-white/5">
          {/* Row 1 */}
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[10px]">1</span>
              <div>
                <span className="font-bold text-white">Invoice Gross Subtotal</span>
                <p className="text-[11px] text-neutral-400">Sum of item rates × quantities before discounts & taxes</p>
              </div>
            </div>
            <span className="font-mono font-bold text-white text-sm">${subTotal.toFixed(2)}</span>
          </div>

          {/* Row 2 */}
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px]">2</span>
              <div>
                <span className="font-bold text-white">Dead Cost Subject to VIG</span>
                <p className="text-[11px] text-neutral-400">Base cost of inventory items subject to VIG multiplier</p>
              </div>
            </div>
            <span className="font-mono font-bold text-amber-300 text-sm">${resolvedDeadCostSubject.toFixed(2)}</span>
          </div>

          {/* Row 3 */}
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px]">3</span>
              <div>
                <span className="font-bold text-white">VIG Multiplier Applied ({resolvedVigRate}x)</span>
                <p className="text-[11px] text-neutral-400">
                  (${resolvedDeadCostSubject.toFixed(2)} × {resolvedVigRate} VIG rate)
                  {isMontgomery ? " — Montgomery Morgan override active" : ""}
                </p>
              </div>
            </div>
            <span className="font-mono font-bold text-amber-300 text-sm">${(resolvedDeadCostSubject * resolvedVigRate).toFixed(2)}</span>
          </div>

          {/* Row 4 */}
          {deadCostNoVig > 0 && (
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[10px]">4</span>
                <div>
                  <span className="font-bold text-white">Dead Cost (Excluded from VIG)</span>
                  <p className="text-[11px] text-neutral-400">Freight, Gift items, or explicit NO VIG overrides</p>
                </div>
              </div>
              <span className="font-mono font-bold text-neutral-300 text-sm">${deadCostNoVig.toFixed(2)}</span>
            </div>
          )}

          {/* Row 5 */}
          <div className="p-3 flex items-center justify-between bg-purple-500/5">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-[10px]">=</span>
              <div>
                <span className="font-bold text-purple-300">Derived Net Profit</span>
                <p className="text-[11px] text-neutral-400">Subtotal (${subTotal.toFixed(2)}) - Cost w/ VIG (${resolvedDeadCostPlusVig.toFixed(2)}) - Fees (${(ccFees + additionalCosts).toFixed(2)})</p>
              </div>
            </div>
            <div className="text-right">
              <span className="font-mono font-black text-purple-300 text-base">${resolvedProfit.toFixed(2)}</span>
              <span className="text-[10px] text-purple-400 block font-bold">{resolvedMargin.toFixed(1)}% Margin</span>
            </div>
          </div>

          {/* Row 6 */}
          <div className="p-3.5 flex items-center justify-between bg-emerald-500/10">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-[10px]">★</span>
              <div>
                <span className="font-bold text-emerald-400 text-sm">Final Payout Commission</span>
                <p className="text-[11px] text-emerald-300/70">
                  {resolvedProfit > 0 
                    ? `Net Profit ($${resolvedProfit.toFixed(2)}) × ${resolvedCommissionPct}% Commission Payout Rate`
                    : "No commission paid on negative or zero profit deals"
                  }
                </p>
              </div>
            </div>
            <span className="font-mono font-black text-emerald-400 text-lg">${resolvedCommission.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Optional Line Items Detail Dropdown */}
      {lineItemDetails.length > 0 && (
        <div className="border border-white/10 rounded-xl overflow-hidden bg-black/20">
          <button
            onClick={() => setShowItemBreakdown(!showItemBreakdown)}
            className="w-full p-3 flex justify-between items-center text-xs font-bold text-neutral-300 hover:bg-white/[0.03] transition-colors"
          >
            <span>Line Items Cost Breakdown ({lineItemDetails.length} items)</span>
            {showItemBreakdown ? <FiChevronUp /> : <FiChevronDown />}
          </button>
          
          {showItemBreakdown && (
            <div className="p-3 border-t border-white/10 space-y-2">
              {lineItemDetails.map((item, i) => (
                <div key={i} className="flex justify-between items-center text-xs border-b border-white/5 pb-1.5 last:border-0">
                  <div>
                    <span className="font-semibold text-white">{item.name}</span>
                    <span className="text-[10px] text-neutral-400 ml-2">Qty: {item.quantity} × ${item.rate}</span>
                    {item.noVig && (
                      <span className="ml-2 text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold">
                        NO VIG
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-neutral-300">
                    Dead Cost: ${((item.deadCost || item.cost || 0) * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
