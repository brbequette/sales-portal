"use client"


import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { FiDollarSign, FiX, FiCreditCard, FiCheck, FiLock } from "react-icons/fi"

declare global {
  interface Window {
    Accept?: {
      dispatchData: (secureData: any, callback: (response: any) => void) => void
    }
  }
}

interface RecordPaymentModalProps {
  invoiceId: string
  customerId: string
  balance: number
  invoiceNumber?: string
  customerName?: string
  onClose: () => void
  onSuccess: () => void
}

const PAYMENT_METHODS = [
  { value: "Check", label: "Check", icon: "ðŸ“„" },
  { value: "ACH", label: "ACH / Bank Transfer", icon: "ðŸ¦" },
  { value: "Wire Transfer", label: "Wire Transfer", icon: "ðŸ”—" },
  { value: "Cash", label: "Cash", icon: "ðŸ’µ" },
  { value: "PayPal", label: "PayPal", icon: "ðŸ…¿ï¸" },
  { value: "Other", label: "Other", icon: "ðŸ“‹" },
]

export function RecordPaymentModal({ invoiceId, customerId, balance, invoiceNumber, customerName, onClose, onSuccess }: RecordPaymentModalProps) {
  const [tab, setTab] = useState<"card" | "manual">("card")
  const [amount, setAmount] = useState(balance.toFixed(2))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")

  // CC fields
  const [cardNumber, setCardNumber] = useState("")
  const [cardName, setCardName] = useState(customerName || "")
  const [expMonth, setExpMonth] = useState("")
  const [expYear, setExpYear] = useState("")
  const [cvv, setCvv] = useState("")
  const [zip, setZip] = useState("")

  // Manual fields
  const [paymentMethod, setPaymentMethod] = useState("Check")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])

  // Authorize.net config
  const [authConfig, setAuthConfig] = useState<{ apiLoginId: string; publicClientKey: string } | null>(null)

  useEffect(() => {
    fetch("/api/get-config")
      .then(r => r.json())
      .then(d => {
        if (d.apiLoginId && d.publicClientKey) {
          setAuthConfig({ apiLoginId: d.apiLoginId, publicClientKey: d.publicClientKey })
        }
      })
      .catch(() => {})
  }, [])

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16)
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ")
  }

  const handleCardPayment = async () => {
    setError("")
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError("Enter a valid amount"); return }
    if (amt > balance && !confirm(`Amount ($${amt.toFixed(2)}) exceeds balance ($${balance.toFixed(2)}). Continue?`)) return

    const rawCard = cardNumber.replace(/\s/g, "")
    if (rawCard.length < 13) { setError("Enter a valid card number"); return }
    if (!expMonth || !expYear) { setError("Enter expiration date"); return }
    if (cvv.length < 3) { setError("Enter a valid CVV"); return }
    if (!cardName.trim()) { setError("Enter cardholder name"); return }

    if (!authConfig) { setError("Payment gateway not configured"); return }
    if (!window.Accept) { setError("Payment processor not loaded. Refresh the page."); return }

    setIsSubmitting(true)
    setStatus("Tokenizing card...")

    try {
      // Step 1: Tokenize with Accept.js
      const opaqueData = await new Promise<{ dataDescriptor: string; dataValue: string }>((resolve, reject) => {
        const secureData = {
          authData: {
            clientKey: authConfig.publicClientKey,
            apiLoginID: authConfig.apiLoginId,
          },
          cardData: {
            cardNumber: rawCard,
            month: expMonth.padStart(2, "0"),
            year: expYear.length === 2 ? `20${expYear}` : expYear,
            cardCode: cvv,
            zip: zip || undefined,
            fullName: cardName,
          },
        }
        window.Accept!.dispatchData(secureData, (response: any) => {
          if (response.messages.resultCode === "Error") {
            reject(new Error(response.messages.message[0].text))
          } else {
            resolve({
              dataDescriptor: response.opaqueData.dataDescriptor,
              dataValue: response.opaqueData.dataValue,
            })
          }
        })
      })

      // Step 2: Charge via Authorize.net
      setStatus("Charging card...")
      const chargeRes = await fetch("/api/authorize-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opaqueDataDescriptor: opaqueData.dataDescriptor,
          opaqueDataValue: opaqueData.dataValue,
          amount: amt.toFixed(2),
          invoiceId,
          invoiceNumber: invoiceNumber || invoiceId,
          customerName: cardName,
        }),
      })

      const chargeData = await chargeRes.json()
      if (!chargeData.success) {
        throw new Error(chargeData.errorText || "Card declined")
      }

      // Step 3: Record payment in Zoho Books
      setStatus("Recording payment in Zoho Books...")
      const payRes = await fetch("/api/zoho-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          customerId,
          amount: amt,
          authCode: chargeData.authCode || chargeData.transId,
          transId: chargeData.transId,
          last4: chargeData.last4,
          cardType: chargeData.cardType,
          paymentMethod: "Credit Card",
          paymentDate: new Date().toISOString().split("T")[0],
        }),
      })

      const payData = await payRes.json()
      if (!payData.success) {
        // Card was charged but Zoho failed â€” warn but don't fail
        console.error("Zoho payment recording failed:", payData.error)
        setStatus(`âš ï¸ Card charged $${amt.toFixed(2)} (Auth: ${chargeData.authCode}) but Zoho recording failed. Record manually.`)
        setTimeout(() => onSuccess(), 3000)
        return
      }

      setStatus(`âœ… Payment of $${amt.toFixed(2)} processed! (Auth: ${chargeData.authCode}, Last 4: ${chargeData.last4})`)
      setTimeout(() => onSuccess(), 1500)
    } catch (e: any) {
      setError(e.message || "Payment failed")
      setStatus("")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleManualPayment = async () => {
    setError("")
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError("Enter a valid amount"); return }
    if (amt > balance && !confirm(`Amount ($${amt.toFixed(2)}) exceeds balance ($${balance.toFixed(2)}). Continue?`)) return

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/zoho-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId, customerId,
          amount: amt,
          authCode: referenceNumber || undefined,
          paymentMethod,
          paymentDate,
        }),
      })
      const data = await res.json()
      if (data.success) {
        onSuccess()
      } else {
        setError(data.error || "Failed to record payment")
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
      <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl z-[61] animate-scale-in max-h-[90vh] overflow-y-auto hidden-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h3 className="text-white font-bold text-sm flex items-center gap-2">
            <FiDollarSign className="text-emerald-400" /> Process Payment
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1 rounded-full bg-neutral-800 transition-colors">
            <FiX size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-4 flex gap-1">
          <button
            onClick={() => setTab("card")}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              tab === "card"
                ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-400"
                : "bg-neutral-800/50 border border-neutral-700/50 text-neutral-400 hover:text-white"
            }`}
          >
            <FiCreditCard size={13} /> Run Credit Card
          </button>
          <button
            onClick={() => setTab("manual")}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              tab === "manual"
                ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-400"
                : "bg-neutral-800/50 border border-neutral-700/50 text-neutral-400 hover:text-white"
            }`}
          >
            <FiDollarSign size={13} /> Manual Record
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Balance Info */}
          <div className="bg-neutral-800/50 rounded-xl p-3 border border-neutral-700/50 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Balance Due</p>
              <p className="text-lg font-black text-red-400">${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            {invoiceNumber && (
              <div className="text-right">
                <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Invoice</p>
                <p className="text-sm font-bold text-neutral-300">#{invoiceNumber}</p>
              </div>
            )}
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

          {tab === "card" ? (
            <>
              {/* Cardholder Name */}
              <div>
                <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1.5">Cardholder Name</label>
                <input
                  type="text"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Name on card"
                  className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-neutral-600"
                />
              </div>

              {/* Card Number */}
              <div>
                <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1.5">Card Number</label>
                <div className="relative">
                  <FiCreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="4111 1111 1111 1111"
                    maxLength={19}
                    className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-neutral-600 tracking-wider font-mono"
                  />
                </div>
              </div>

              {/* Exp / CVV / ZIP */}
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1.5">Month</label>
                  <select
                    value={expMonth}
                    onChange={(e) => setExpMonth(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-2 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="">MM</option>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1.5">Year</label>
                  <select
                    value={expYear}
                    onChange={(e) => setExpYear(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-2 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="">YY</option>
                    {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + i)).map(y => (
                      <option key={y} value={y}>{y.slice(2)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1.5">CVV</label>
                  <input
                    type="password"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="â€¢â€¢â€¢"
                    maxLength={4}
                    className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-neutral-600 text-center tracking-widest"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1.5">ZIP</label>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    placeholder="85001"
                    maxLength={5}
                    className="w-full bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-neutral-600 text-center"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Manual Payment Method */}
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
            </>
          )}

          {/* Status */}
          {status && (
            <div className={`rounded-lg p-3 text-xs font-bold border ${
              status.includes("âœ…") ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
              status.includes("âš ï¸") ? "bg-amber-500/10 border-amber-500/30 text-amber-400" :
              "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
            }`}>
              {!status.includes("âœ…") && !status.includes("âš ï¸") && (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block mr-2" />
              )}
              {status}
            </div>
          )}

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
            onClick={tab === "card" ? handleCardPayment : handleManualPayment}
            disabled={isSubmitting}
            className={`flex-1 font-bold py-2.5 rounded-lg text-xs transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 ${
              tab === "card"
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/30"
            }`}
          >
            {isSubmitting ? (
              <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
            ) : tab === "card" ? (
              <><FiLock size={13} /> Charge ${parseFloat(amount || "0").toFixed(2)}</>
            ) : (
              <><FiCheck size={14} /> Record Payment</>
            )}
          </button>
        </div>

        {/* Security note */}
        {tab === "card" && (
          <div className="px-5 pb-4 flex items-center gap-1.5 text-[10px] text-neutral-600">
            <FiLock size={10} />
            Processed securely via Authorize.net. Card data never touches our servers.
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

