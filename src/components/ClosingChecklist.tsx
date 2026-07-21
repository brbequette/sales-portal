"use client"


import { useState } from "react"
import { FiCheckCircle } from "react-icons/fi"

interface ClosingChecklistProps {
  dealId: string
  currentStageSlug: string
  onComplete: () => void
}

export function ClosingChecklist({ dealId, currentStageSlug, onComplete }: ClosingChecklistProps) {
  const [checkedItems, setCheckedItems] = useState({
    paymentVerified: false,
    giftSent: false,
    satisfactionChecked: false,
  })

  const isVisible =
    currentStageSlug === "invoice-paid" ||
    currentStageSlug === "paid-needs-final-gift-sent" ||
    currentStageSlug === "paid" ||
    currentStageSlug === "needs_gift"

  if (!isVisible) return null

  const allChecked = Object.values(checkedItems).every(Boolean)

  const toggleCheck = (key: keyof typeof checkedItems) => {
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div 
      className="mt-3 glass-panel border border-white/10 rounded-xl p-4 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300"
      onClick={e => e.stopPropagation()}
    >
      <h4 className="text-sm font-black uppercase tracking-wider text-neutral-100 mb-3 flex items-center gap-2">
        <FiCheckCircle className="text-emerald-500" />
        Closing Checklist
      </h4>
      <div className="space-y-2 mb-4">
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={checkedItems.paymentVerified}
            onChange={() => toggleCheck("paymentVerified")}
            className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-emerald-500 focus:ring-emerald-500/20"
          />
          <span className={`text-xs transition-colors ${checkedItems.paymentVerified ? "text-neutral-500 line-through" : "text-neutral-300 group-hover:text-white"}`}>
            Final payment collected and verified
          </span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={checkedItems.giftSent}
            onChange={() => toggleCheck("giftSent")}
            className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-emerald-500 focus:ring-emerald-500/20"
          />
          <span className={`text-xs transition-colors ${checkedItems.giftSent ? "text-neutral-500 line-through" : "text-neutral-300 group-hover:text-white"}`}>
            Final gift sent to customer
          </span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={checkedItems.satisfactionChecked}
            onChange={() => toggleCheck("satisfactionChecked")}
            className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-emerald-500 focus:ring-emerald-500/20"
          />
          <span className={`text-xs transition-colors ${checkedItems.satisfactionChecked ? "text-neutral-500 line-through" : "text-neutral-300 group-hover:text-white"}`}>
            Customer satisfaction checked / review requested
          </span>
        </label>
      </div>

      {allChecked && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
          className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 px-4 py-2 rounded-lg font-bold transition-colors text-xs flex items-center justify-center gap-2"
        >
          <FiCheckCircle size={14} />
          Complete Sales Cycle
        </button>
      )}
    </div>
  )
}

