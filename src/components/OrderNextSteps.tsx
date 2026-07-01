"use client"
import React, { useMemo, useState } from "react"
import { FiArrowRight, FiPackage, FiTruck, FiDollarSign, FiSend, FiCheckCircle, FiFileText, FiChevronDown, FiChevronUp, FiClipboard } from "react-icons/fi"

type NextStep = {
  id: string
  docType: "Quote" | "SalesOrder" | "Invoice"
  docNumber: string
  accountName: string
  amount: number
  status: string
  date: string
  stepLabel: string
  stepIcon: React.ReactNode
  stepColor: string
  priority: number // lower = more urgent
  raw: any
}

const STEP_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; priority: number }> = {
  "confirm_so": { label: "Confirm Sales Order", icon: <FiCheckCircle size={13} />, color: "text-emerald-400", priority: 1 },
  "create_packages": { label: "Create Packages / Dropship", icon: <FiPackage size={13} />, color: "text-amber-400", priority: 4 },
  "ship_packages": { label: "Ship Packages", icon: <FiTruck size={13} />, color: "text-orange-400", priority: 5 },
  "convert_to_inv": { label: "Convert to Invoice", icon: <FiArrowRight size={13} />, color: "text-violet-400", priority: 6 },
  "send_invoice": { label: "Send Invoice to Customer", icon: <FiSend size={13} />, color: "text-blue-400", priority: 7 },
}

function getNextStep(doc: any, docType: "Quote" | "SalesOrder" | "Invoice"): string | null {
  const s = (doc.status || "").toLowerCase()
  const items = doc.items && !Array.isArray(doc.items) ? doc.items : {}

  // Skip any doc that's already been converted, closed, voided, or completed
  if (["invoiced", "closed", "void", "voided", "declined", "paid", "partially_refunded", "refunded", "write_off"].includes(s)) {
    return null
  }

  if (docType === "Quote") return null

  if (docType === "SalesOrder") {
    if (s === "draft") return "confirm_so"
    if (s === "open" || s === "confirmed") {
      const hasPackages = items?.packages && items.packages.length > 0
      const hasShipments = items?.shipments && items.shipments.length > 0
      if (!hasPackages) return "create_packages"
      if (!hasShipments) return "ship_packages"
      return "convert_to_inv"
    }
    return null
  }

  if (docType === "Invoice") {
    if (s === "draft") return "send_invoice"
    return null // sent, paid, overdue, void — not processing tasks
  }

  return null
}

export function OrderNextSteps({ accounts, onViewDoc }: { accounts: any[]; onViewDoc?: (type: string, doc: any) => void }) {
  const [expanded, setExpanded] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const steps = useMemo(() => {
    const result: NextStep[] = []

    accounts.forEach(account => {
      const processDoc = (doc: any, docType: "Quote" | "SalesOrder" | "Invoice") => {
        const stepKey = getNextStep(doc, docType)
        if (!stepKey) return

        const config = STEP_CONFIG[stepKey]
        if (!config) return

        const items = doc.items && !Array.isArray(doc.items) ? doc.items : {}
        const docNumber = items?.invoiceNumber || items?.quoteNumber || items?.salesOrderNumber || doc.zohoId?.slice(-6) || doc.id?.slice(-6) || "—"

        result.push({
          id: doc.id,
          docType,
          docNumber,
          accountName: account.name,
          amount: parseFloat(doc.amount || 0),
          status: doc.status || "Draft",
          date: doc.issueDate || doc.orderDate || doc.createdAt || "",
          stepLabel: config.label,
          stepIcon: config.icon,
          stepColor: config.color,
          priority: config.priority,
          raw: doc,
        })
      }

      // Quotes excluded from next steps
      ;(account.salesOrders || []).forEach((s: any) => processDoc(s, "SalesOrder"))
      ;(account.invoices || []).forEach((i: any) => processDoc(i, "Invoice"))
    })

    // Sort by priority (overdue first, then by urgency)
    result.sort((a, b) => a.priority - b.priority || new Date(a.date).getTime() - new Date(b.date).getTime())

    return result
  }, [accounts])

  const displaySteps = showAll ? steps : steps.slice(0, 8)

  if (steps.length === 0) return null

  const typeLabel = (t: string) => t === "SalesOrder" ? "SO" : t === "Invoice" ? "INV" : "QTE"
  const typeBg = (t: string) => t === "Invoice" ? "bg-emerald-500/12 text-emerald-400 border-emerald-500/25" : t === "SalesOrder" ? "bg-sky-500/12 text-sky-400 border-sky-500/25" : "bg-violet-500/12 text-violet-400 border-violet-500/25"

  return (
    <div className="mb-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-2 group"
      >
        <div className="flex items-center gap-2">
          <FiClipboard className="text-amber-400" size={16} />
          <h2 className="text-base font-bold text-white">Next Steps</h2>
          <span className="text-[10px] bg-amber-900/40 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
            {steps.length} action{steps.length !== 1 ? "s" : ""}
          </span>
        </div>
        {expanded ? <FiChevronUp size={14} className="text-neutral-500" /> : <FiChevronDown size={14} className="text-neutral-500" />}
      </button>

      {expanded && (
        <div className="space-y-1.5">
          {displaySteps.map((step, idx) => (
            <button
              key={`${step.id}-${idx}`}
              onClick={() => onViewDoc?.(step.docType, step.raw)}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.025] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all text-left group"
            >
              {/* Step icon */}
              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                step.priority === 0 ? "bg-rose-500/15 text-rose-400" : "bg-white/[0.06]"
              } ${step.stepColor}`}>
                {step.stepIcon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${typeBg(step.docType)}`}>
                    {typeLabel(step.docType)}
                  </span>
                  <span className="text-[11px] font-bold text-white truncate">{step.accountName}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[10px] font-semibold ${step.stepColor}`}>{step.stepLabel}</span>
                  <span className="text-[9px] text-neutral-600">•</span>
                  <span className="text-[9px] text-neutral-500 font-mono">#{step.docNumber}</span>
                </div>
              </div>

              {/* Amount */}
              <div className="text-right shrink-0">
                <span className="text-[11px] font-bold text-white">${step.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>

              <FiArrowRight size={12} className="text-neutral-600 group-hover:text-white transition-colors shrink-0" />
            </button>
          ))}

          {steps.length > 8 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-center py-1.5 text-[10px] font-bold text-neutral-400 hover:text-white transition-colors uppercase tracking-wider"
            >
              {showAll ? "Show Less" : `Show All ${steps.length} Actions`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
