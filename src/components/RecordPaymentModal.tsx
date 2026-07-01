"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { FiDollarSign, FiX, FiCreditCard, FiCheck } from "react-icons/fi"

interface RecordPaymentModalProps {
  invoiceId: string
  customerId: string
  balance: number
  onClose: () => void
  onSuccess: () => void
}

const PAYMENT_METHODS = [
  { value: "Credit Card", label: "Credit Card", icon: "💳" },
  { value: "Check", label: "Check", icon: "📄" },
  { value: "ACH", label: "ACH / Bank Transfer", icon: "🏦" },
  { value: "Wire Transfer", label: "Wire Transfer", icon: "🔗" },
  { value: "Cash", label: "Cash", icon: "💵" },
  { value: "PayPal", label: "PayPal", icon: "🅿️" },
  { value: "Other", label: "Other", icon: "📋" },
]

export function RecordPaymentModal({ invoiceId, customerId, balance, onClose, onSuccess }: RecordPaymentModalProps) {
  const [amount, setAmount] = useState(balance.toFixed(2))
  const [paymentMethod, setPaymentMethod] = useState("Credit Card")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async () => {
    setError("")
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      setError("Please enter a valid payment amount")
      return
    }
    if (amt > balance) {
      if (!confirm(`Amount ($${amt.toFixed(2)}) exceeds balance due ($${balance.toFixed(2)}). Continue?`)) return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/zoho-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          customerId,
          amount: amt,
          authCode: referenceNumber || undefined,
          paymentMethod,
          paymentDate,
          notes,
        }),
      })
      const data = await res.json()
      if (data.success) {
        onSuccess()
      } else {
        setError(data.error || data.message || "Failed to record payment")
      }
    } catch (e: any) {
      setError(e.message || "An error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl z-[61] animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h3 className="text-white font-bold text-sm flex items-center gap-2">
            <FiDollarSign className="text-emerald-400" /> Record Payment
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1 rounded-full bg-neutral-800 transition-colors">
            <FiX size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Balance Info */}
          <div className="bg-neutral-800/50 rounded-xl p-3 border border-neutral-700/50">
            <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Balance Due</p>
            <p className="text-lg font-black text-red-400">${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>

          {/* Amount */}
          <div>
            <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1.5">Payment Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-bold text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm font-bold rounded-lg pl-7 pr-3 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <button
              onClick={() => setAmount(balance.toFixed(2))}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 mt-1 font-bold"
            >
              Pay Full Balance
            </button>
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1.5">Payment Method</label>
            <div className="grid grid-cols-2 gap-1.5">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setPaymentMethod(m.value)}
                  className={`text-left px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                    paymentMethod === m.value
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                      : "bg-neutral-800/50 border-neutral-700/50 text-neutral-400 hover:border-neutral-600"
                  }`}
                >
                  <span className="mr-1.5">{m.icon}</span> {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reference # */}
          <div>
            <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1.5">Reference / Auth Code</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Check #, Auth code, Transaction ID..."
              className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-neutral-600"
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1.5">Payment Date</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-xs font-bold">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-neutral-800 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold py-2.5 rounded-lg text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg text-xs transition-colors shadow-lg shadow-emerald-900/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
            ) : (
              <><FiCheck size={14} /> Record Payment</>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
