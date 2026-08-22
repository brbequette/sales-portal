"use client"


import { useState } from "react"
import { FiCheckCircle, FiChevronDown, FiChevronRight } from "react-icons/fi"

export type ClosingChecklistState = {
  paymentVerified: boolean
  giftSent: boolean
  satisfactionChecked: boolean
}

interface ClosingChecklistProps {
  dealId: string
  currentStageSlug: string
  onComplete: () => void
  initialState?: Partial<ClosingChecklistState> | null
  onChange?: (state: ClosingChecklistState) => void
}

export function ClosingChecklist({ dealId, currentStageSlug, onComplete, initialState, onChange }: ClosingChecklistProps) {
  const [expanded, setExpanded] = useState(false)
  const [checkedItems, setCheckedItems] = useState({
    paymentVerified: initialState?.paymentVerified === true,
    giftSent: initialState?.giftSent === true,
    satisfactionChecked: initialState?.satisfactionChecked === true,
  })

  const isVisible =
    currentStageSlug === "invoice-paid" ||
    currentStageSlug === "paid-needs-final-gift-sent" ||
    currentStageSlug === "paid" ||
    currentStageSlug === "needs_gift"

  if (!isVisible) return null

  const allChecked = Object.values(checkedItems).every(Boolean)

  const toggleCheck = (key: keyof typeof checkedItems) => {
    setCheckedItems(prev => {
      const next = { ...prev, [key]: !prev[key] }
      onChange?.(next)
      return next
    })
  }

  const completedCount = Object.values(checkedItems).filter(Boolean).length

  return (
    <div 
      className="mt-3 border border-white/10 rounded-lg bg-black/20"
      onClick={e => e.stopPropagation()}
    >
      <button onClick={() => setExpanded(value => !value)} className="w-full px-2.5 py-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-neutral-300">
        <span className="flex items-center gap-1.5"><FiCheckCircle className="text-emerald-500" /> Closing checklist {completedCount}/3</span>
        {expanded ? <FiChevronDown /> : <FiChevronRight />}
      </button>
      {expanded && <div className="space-y-2 px-3 pb-3">
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
      </div>}

      {expanded && allChecked && (
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

