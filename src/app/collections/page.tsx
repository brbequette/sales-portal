"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import { usePagination, Pagination } from "@/components/Pagination"
import { usePreferences } from "@/components/PreferencesProvider"
import { useZoho } from "@/components/ZohoProvider"
import { useProductModal } from "@/components/ProductModalProvider"
import { InvoiceDetailsModal } from "@/components/InvoiceDetailsModal"
import {
  FiPhoneCall, FiSearch, FiRefreshCw, FiDownload, FiAlertCircle,
  FiClock, FiCheckCircle, FiX, FiChevronRight, FiUser, FiFilter,
  FiMail, FiCreditCard, FiRotateCcw, FiTag, FiTruck, FiDollarSign,
  FiCalendar, FiMapPin, FiFileText, FiList, FiExternalLink
} from "react-icons/fi"

// ── Types ──────────────────────────────────────────────────────────────
type Invoice = {
  id: string
  zohoId: string
  invoice_number: string
  customer_name: string
  salesperson_name: string
  salesperson_id: string
  salesperson_zoho_id?: string | null
  salesperson_email?: string | null
  due_date: string | null
  issue_date: string | null
  balance: number
  total: number
  status: string
  days_overdue: number
  books_invoice_id: string | null
  customer_id: string
  profit?: number
  dead_cost?: number
  account?: {
    ownerId?: string | null
  } | null
}

type CallOutcome =
  | "left_voicemail" | "no_answer" | "promise_to_pay"
  | "early_pay_discount" | "paid_in_full" | "disputed"
  | "callback_requested" | "other"

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  left_voicemail: "Left Voicemail",
  no_answer: "No Answer",
  promise_to_pay: "Promise to Pay",
  early_pay_discount: "Discount Agreed (5%)",
  paid_in_full: "Paid in Full",
  disputed: "Disputed",
  callback_requested: "Callback Requested",
  other: "Other",
}

const OUTCOME_COLORS: Record<CallOutcome, string> = {
  left_voicemail: "text-neutral-400 bg-neutral-800 border-neutral-700",
  no_answer: "text-neutral-400 bg-neutral-800 border-neutral-700",
  promise_to_pay: "text-blue-400 bg-blue-900/30 border-blue-800/40",
  early_pay_discount: "text-amber-400 bg-amber-900/30 border-amber-800/40",
  paid_in_full: "text-emerald-400 bg-emerald-900/30 border-emerald-800/40",
  disputed: "text-red-400 bg-red-900/30 border-red-800/40",
  callback_requested: "text-purple-400 bg-purple-900/30 border-purple-800/40",
  other: "text-neutral-400 bg-neutral-800 border-neutral-700",
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0)
}

function agingBucket(days: number) {
  if (days > 90) return { label: "90+ days", cls: "text-red-400 bg-red-950/40 border-red-500/30" }
  if (days > 60) return { label: "61–90d",   cls: "text-orange-400 bg-orange-950/40 border-orange-500/30" }
  if (days > 30) return { label: "31–60d",   cls: "text-amber-400 bg-amber-950/40 border-amber-500/30" }
  return               { label: "1–30d",    cls: "text-yellow-400 bg-yellow-950/40 border-yellow-500/30" }
}

function getProductImage(name: string, sku?: string) {
  const s = (sku || "").toLowerCase()
  const n = (name || "").toLowerCase()
  if (s.includes("td-bl-100") || n.includes("turbo blade")) return "/images/turbo_blade.png"
  if (s.includes("td-bl-102") || n.includes("continuous rim")) return "/images/continuous_rim_blade.png"
  if (s.includes("td-pp-200") || n.includes("polishing pad")) return "/images/polishing_pads.png"
  if (s.includes("td-cb-300") || n.includes("core bit")) return "/images/core_bit.png"
  if (s.includes("td-cw-400") || n.includes("cup wheel") || n.includes("grinding")) return "/images/cup_wheel.png"
  return null
}

// ── Log Call Modal ─────────────────────────────────────────────────────
function CallModal({ invoice, onClose, onSaved }: { invoice: Invoice, onClose: () => void, onSaved: () => void }) {
  const { zohoContext: user } = useZoho()
  const [outcome, setOutcome] = useState<CallOutcome>("left_voicemail")
  const [callerName, setCallerName] = useState("")
  const [spokeTo, setSpokeTo] = useState("")
  const [contactReached, setContactReached] = useState(false)
  const [notes, setNotes] = useState("")
  const [promiseDate, setPromiseDate] = useState("")
  const [followUpDate, setFollowUpDate] = useState("")
  const [duration, setDuration] = useState("")
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user?.name) {
      setCallerName(user.name)
    } else if (user?.email) {
      setCallerName(user.email.split("@")[0])
    }
  }, [user])

  useEffect(() => {
    let t: ReturnType<typeof setInterval>
    if (timerRunning) {
      t = setInterval(() => setTimerSeconds(s => s + 1), 1000)
    }
    return () => clearInterval(t)
  }, [timerRunning])

  const toggleTimer = () => {
    if (timerRunning) {
      setDuration(Math.ceil(timerSeconds / 60).toString())
      setTimerRunning(false)
    } else {
      setTimerSeconds(0)
      setTimerRunning(true)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/log-collection-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          outcome,
          callerName,
          contactReached,
          spokeTo,
          notes,
          promiseDate,
          followUpDate,
          durationMinutes: parseInt(duration) || 0,
        }),
      })
      const data = await res.json()
      if (data.success) {
        onSaved()
        onClose()
      } else {
        alert("Failed to log call: " + data.error)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const mm = String(Math.floor(timerSeconds / 60)).padStart(2, "0")
  const ss = String(timerSeconds % 60).padStart(2, "0")

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-neutral-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FiPhoneCall className="text-emerald-400" /> Log Call
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">{invoice.customer_name} — Inv #{invoice.invoice_number}</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white p-1 transition-colors"><FiX /></button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {/* Outcome */}
          <div>
            <label className="text-xs text-neutral-400 font-semibold uppercase tracking-wide block mb-2">Outcome</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(OUTCOME_LABELS) as CallOutcome[]).map(k => (
                <button key={k} onClick={() => setOutcome(k)}
                  className={`text-xs font-semibold px-2.5 py-2.5 rounded-lg border transition-all text-left ${
                    outcome === k ? OUTCOME_COLORS[k] + " border-current" : "text-neutral-400 bg-neutral-800 border-transparent hover:border-neutral-700"
                  }`}
                >
                  {OUTCOME_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {/* Contact reached? */}
          <div className="flex items-center gap-3">
            <input type="checkbox" id="reached" checked={contactReached} onChange={e => setContactReached(e.target.checked)}
              className="w-4 h-4 accent-emerald-500 cursor-pointer" />
            <label htmlFor="reached" className="text-sm text-neutral-300 cursor-pointer">Contact reached?</label>
          </div>
          {contactReached && (
            <input value={spokeTo} onChange={e => setSpokeTo(e.target.value)} placeholder="Spoke with..."
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500" />
          )}

          {/* Duration */}
          <div className="flex items-center gap-2">
            <input value={timerRunning ? `${mm}:${ss}` : duration} onChange={e => setDuration(e.target.value)}
              placeholder="Duration (min)" readOnly={timerRunning}
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500" />
            <button onClick={toggleTimer}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                timerRunning ? "bg-red-600 hover:bg-red-500 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700"
              }`}
            >
              {timerRunning ? `⏱ ${mm}:${ss}` : "Start Timer"}
            </button>
          </div>

          {/* Caller */}
          <input value={callerName} onChange={e => setCallerName(e.target.value)} placeholder="Your name"
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500" />

          {/* Promise date */}
          {["promise_to_pay", "early_pay_discount"].includes(outcome) && (
            <div>
              <label className="text-xs text-neutral-400 font-semibold mb-1 block">Promise to Pay By</label>
              <input type="date" value={promiseDate} onChange={e => setPromiseDate(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
          )}

          {/* Follow-up */}
          <div>
            <label className="text-xs text-neutral-400 font-semibold mb-1 block">Follow-up Date</label>
            <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-500" />
          </div>

          {/* Notes */}
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes..." rows={3}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 resize-none" />
        </div>

        <div className="p-5 border-t border-neutral-800 flex gap-2 justify-end bg-neutral-900/60 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-neutral-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors">
            {saving ? "Saving..." : "Save Log"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Run Card Modal ─────────────────────────────────────────────────────
interface RunCardProps {
  invoice: Invoice
  onClose: () => void
  onSuccess: () => void
}

function RunCardModal({ invoice, onClose, onSuccess }: RunCardProps) {
  const [cardNumber, setCardNumber] = useState("")
  const [expiryMonth, setExpiryMonth] = useState("")
  const [expiryYear, setExpiryYear] = useState("")
  const [cvv, setCvv] = useState("")
  const [zip, setZip] = useState("")
  const [fullName, setFullName] = useState("")
  const [chargeAmount, setChargeAmount] = useState("")
  
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState("")
  const [errorText, setErrorText] = useState("")

  useEffect(() => {
    setFullName(invoice.customer_name)
    setChargeAmount(invoice.balance.toFixed(2))
  }, [invoice])

  const formatCard = (val: string) => {
    const clean = val.replace(/\D/g, "").substring(0, 16)
    const matches = clean.match(/\d{4,16}/g)
    const match = (matches && matches[0]) || ""
    const parts = []
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }
    if (parts.length > 0) {
      return parts.join(" ")
    } else {
      return clean
    }
  }

  const handleCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardNumber(formatCard(e.target.value))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorText("")
    setStatusText("Initializing payment request...")

    try {
      // 1. Fetch config to get Authorize.Net Public Client Key & Login ID
      setStatusText("Fetching Authorize.Net credentials...")
      const configRes = await fetch("/api/get-config")
      const configData = await configRes.json()
      
      const authNet = configData?.authorizeNet
      if (!authNet?.apiLoginId || !authNet?.publicClientKey) {
        throw new Error("Authorize.Net public key credentials are not configured in Netlify environment.")
      }

      if (typeof (window as any).Accept === "undefined") {
        throw new Error("Accept.js is not loaded in layout head. Check connection.")
      }

      // 2. Tokenize card via Accept.js
      setStatusText("Tokenizing credit card credentials...")
      const secureData = {
        authData: {
          clientKey: authNet.publicClientKey,
          apiLoginID: authNet.apiLoginId,
        },
        cardData: {
          cardNumber: cardNumber.replace(/\s/g, ""),
          month: expiryMonth,
          year: expiryYear,
          cardCode: cvv,
          zip,
          fullName,
        },
      }

      ;(window as any).Accept.dispatchData(secureData, async (response: any) => {
        if (response.messages.resultCode === "Error") {
          const msgs = response.messages.message.map((m: any) => m.text).join("; ")
          setErrorText("Card Tokenization Error: " + msgs)
          setLoading(false)
        } else {
          // Token obtained successfully
          const { dataDescriptor, dataValue } = response.opaqueData
          
          try {
            // 3. Process Authorize.Net charge on Netlify Serverless Function
            setStatusText("Authorizing credit card transaction...")
            const chargeRes = await fetch("/api/authorize-charge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                opaqueDataDescriptor: dataDescriptor,
                opaqueDataValue: dataValue,
                amount: parseFloat(chargeAmount),
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoice_number,
                customerName: invoice.customer_name
              })
            })

            const chargeData = await chargeRes.json()
            if (!chargeData.success) {
              setErrorText("Transaction Declined: " + (chargeData.errorText || "Invalid card details."))
              setLoading(false)
              return
            }

            // 4. CC approved! Now record Zoho payment
            setStatusText("Registering transaction payment details in Zoho Books...")
            const paymentRes = await fetch("/api/zoho-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customerId: invoice.customer_id,
                invoiceId: invoice.id,
                amount: parseFloat(chargeAmount),
                authCode: chargeData.authCode
              })
            })

            const paymentData = await paymentRes.json()
            if (!paymentData.success) {
              setErrorText("Payment warning: Card was charged (Auth Code: " + chargeData.authCode + "), but recording payment in Zoho failed: " + paymentData.error)
              setLoading(false)
              return
            }

            // 5. Success! Log call outcome as Paid in Full
            setStatusText("Logging invoice status updates...")
            await fetch("/api/log-collection-call", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                invoiceId: invoice.id,
                outcome: "paid_in_full",
                callerName: "System Payment",
                contactReached: true,
                spokeTo: "Customer (Card Payment)",
                notes: `Credit Card Charged successfully. Amount: $${parseFloat(chargeAmount).toFixed(2)}. Auth Code: ${chargeData.authCode}. Trans ID: ${chargeData.transId}. Card: ${chargeData.cardType} ending in ${chargeData.last4}`,
                durationMinutes: 0
              })
            })

            setStatusText("Transaction processed successfully!")
            setTimeout(() => {
              onSuccess()
              onClose()
            }, 1000)

          } catch (serverErr: any) {
            setErrorText("Server Transaction Error: " + serverErr.message)
            setLoading(false)
          }
        }
      })

    } catch (err: any) {
      setErrorText(err.message || "An unexpected error occurred.")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-950/40">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FiCreditCard className="text-purple-400" /> Run Credit Card
          </h2>
          <button onClick={onClose} disabled={loading} className="text-neutral-500 hover:text-white p-1 transition-colors">
            <FiX />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-neutral-950/50 border border-neutral-800 rounded-lg p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold text-neutral-500">Invoice Reference</span>
            <div className="text-sm font-semibold text-neutral-300">Inv #{invoice.invoice_number} · {invoice.customer_name}</div>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Amount to Charge ($)</label>
            <input type="number" step="0.01" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} required disabled={loading}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Cardholder Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required disabled={loading} placeholder="Name on credit card"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500" />
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Card Number</label>
            <input type="text" value={cardNumber} onChange={handleCardChange} required disabled={loading} placeholder="0000 0000 0000 0000"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Exp Month</label>
              <input type="text" value={expiryMonth} onChange={e => setExpiryMonth(e.target.value.replace(/\D/g, "").substring(0, 2))} required disabled={loading} placeholder="MM"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-center text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Exp Year</label>
              <input type="text" value={expiryYear} onChange={e => setExpiryYear(e.target.value.replace(/\D/g, "").substring(0, 4))} required disabled={loading} placeholder="YYYY"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-center text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">CVV</label>
              <input type="password" value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g, "").substring(0, 4))} required disabled={loading} placeholder="***"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-center text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500" />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Billing ZIP Code</label>
            <input type="text" value={zip} onChange={e => setZip(e.target.value)} required disabled={loading} placeholder="ZIP code"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500" />
          </div>

          {statusText && (
            <div className="text-xs text-purple-400 font-semibold flex items-center gap-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              {statusText}
            </div>
          )}

          {errorText && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 p-2.5 rounded-lg flex items-center gap-2">
              <FiAlertCircle className="shrink-0" />
              <span>{errorText}</span>
            </div>
          )}

          <div className="pt-2 flex gap-2 justify-end">
            <button type="button" onClick={onClose} disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-neutral-400 hover:text-white transition-colors">Cancel</button>
            <button type="submit" disabled={loading}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2">
              {loading ? "Processing..." : "Run Transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Request Return Modal ───────────────────────────────────────────────
interface RequestReturnProps {
  invoice: Invoice
  onClose: () => void
  onSuccess: () => void
}

function RequestReturnModal({ invoice, onClose, onSuccess }: RequestReturnProps) {
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [labelResult, setLabelResult] = useState<{ labelUrl: string, shipmentId: string } | null>(null)
  const [errorText, setErrorText] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorText("")
    
    try {
      const res = await fetch("/api/easyship-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, reason })
      })
      const data = await res.json()
      if (data.success) {
        setLabelResult(data)
        
        // Log call details
        await fetch("/api/log-collection-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: invoice.id,
            outcome: "other",
            callerName: "System Return",
            contactReached: true,
            spokeTo: "Customer (Return Requested)",
            notes: `EasyShip Return Label Generated. Shipment ID: ${data.shipmentId}. Reason: ${reason}`,
            durationMinutes: 0
          })
        })

        onSuccess()
      } else {
        setErrorText(data.error || "Failed to generate EasyShip return shipment.")
      }
    } catch (err: any) {
      setErrorText(err.message || "An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-950/40">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FiTruck className="text-red-400" /> Request Return label
          </h2>
          <button onClick={onClose} disabled={loading} className="text-neutral-500 hover:text-white p-1 transition-colors">
            <FiX />
          </button>
        </div>

        {labelResult ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full flex items-center justify-center mx-auto text-xl">
              ✓
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Return Label Generated!</h3>
              <p className="text-xs text-neutral-400 mt-1">Shipment ID: <span className="font-mono text-neutral-300">{labelResult.shipmentId}</span></p>
            </div>
            <div className="pt-2">
              <a href={labelResult.labelUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-5 py-2.5 rounded-lg transition-colors">
                Print Return Label <FiExternalLink size={14} />
              </a>
            </div>
            <div className="pt-4">
              <button onClick={onClose} className="text-xs text-neutral-500 hover:text-white underline font-semibold">
                Close Window
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="text-xs text-neutral-400">
              Generating a return label will create a cheap courier shipping tag via EasyShip, matching the original invoice line weights.
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Reason for Return</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} required disabled={loading} placeholder="e.g., Damaged items, order cancellation"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500" />
            </div>

            {errorText && (
              <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 p-2.5 rounded-lg flex items-center gap-2">
                <FiAlertCircle className="shrink-0" />
                <span>{errorText}</span>
              </div>
            )}

            <div className="pt-2 flex gap-2 justify-end">
              <button type="button" onClick={onClose} disabled={loading}
                className="px-4 py-2 text-sm font-semibold text-neutral-400 hover:text-white transition-colors">Cancel</button>
              <button type="submit" disabled={loading}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2">
                {loading ? "Generating Tag..." : "Generate Tag & Return"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Call Campaign / Collections Script Modal ──────────────────────────
function CallCampaignModal({ invoices, onClose, onRefresh }: { invoices: Invoice[], onClose: () => void, onRefresh: () => void }) {
  const { zohoContext: user } = useZoho()
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedAccountIndex, setSelectedAccountIndex] = useState(0)
  
  // Disposition state
  const [outcome, setOutcome] = useState<CallOutcome>("left_voicemail")
  const [callerName, setCallerName] = useState("")
  const [contactReached, setContactReached] = useState(false)
  const [spokeTo, setSpokeTo] = useState("")
  const [notes, setNotes] = useState("")
  const [promiseDate, setPromiseDate] = useState("")
  const [followUpDate, setFollowUpDate] = useState("")
  const [duration, setDuration] = useState("")
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [saving, setSaving] = useState(false)

  // Initialize caller name
  useEffect(() => {
    if (user?.name) {
      setCallerName(user.name)
    } else if (user?.email) {
      setCallerName(user.email.split("@")[0])
    }
  }, [user])

  // Timer
  useEffect(() => {
    let t: ReturnType<typeof setInterval>
    if (timerRunning) {
      t = setInterval(() => setTimerSeconds(s => s + 1), 1005)
    }
    return () => clearInterval(t)
  }, [timerRunning])

  const toggleTimer = () => {
    if (timerRunning) {
      setDuration(Math.ceil(timerSeconds / 60).toString())
      setTimerRunning(false)
    } else {
      setTimerSeconds(0)
      setTimerRunning(true)
    }
  }

  // Group outstanding invoices by customer/account
  const accounts = useMemo(() => {
    const map: Record<string, {
      customerId: string
      customerName: string
      invoices: Invoice[]
      totalBalance: number
      oldestInvoice: Invoice | null
    }> = {}

    invoices.forEach(inv => {
      const cid = inv.customer_id
      if (!map[cid]) {
        map[cid] = {
          customerId: cid,
          customerName: inv.customer_name,
          invoices: [],
          totalBalance: 0,
          oldestInvoice: null
        }
      }
      map[cid].invoices.push(inv)
      map[cid].totalBalance += inv.balance

      if (!map[cid].oldestInvoice || inv.days_overdue > (map[cid].oldestInvoice?.days_overdue || 0)) {
        map[cid].oldestInvoice = inv
      }
    })

    return Object.values(map)
      .filter(acc => acc.customerName.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => b.totalBalance - a.totalBalance)
  }, [invoices, searchTerm])

  const activeAccount = accounts[selectedAccountIndex] || null

  // Selection of invoices for batch disposition
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, boolean>>({})

  // Automatically select all invoices of the active customer when active customer changes
  useEffect(() => {
    if (activeAccount) {
      const initial: Record<string, boolean> = {}
      activeAccount.invoices.forEach(inv => {
        initial[inv.id] = true
      })
      setSelectedInvoices(initial)
      // Reset form states
      setOutcome("left_voicemail")
      setSpokeTo("")
      setContactReached(false)
      setNotes("")
      setPromiseDate("")
      setFollowUpDate("")
      setDuration("")
      setTimerRunning(false)
      setTimerSeconds(0)
    }
  }, [activeAccount])

  const handleSave = async () => {
    if (!activeAccount) return
    const idsToSave = Object.keys(selectedInvoices).filter(id => selectedInvoices[id])
    if (idsToSave.length === 0) {
      alert("Please select at least one invoice to disposition.")
      return
    }

    setSaving(true)
    try {
      await Promise.all(idsToSave.map(invoiceId => 
        fetch("/api/log-collection-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId,
            outcome,
            callerName,
            contactReached,
            spokeTo,
            notes: notes ? `${notes} (Logged via Batch Call campaign)` : "Logged via Batch Call campaign",
            promiseDate,
            followUpDate,
            durationMinutes: parseInt(duration) || 0,
          }),
        })
      ))

      onRefresh()
      // Move to next account or reset selection
      if (selectedAccountIndex < accounts.length - 1) {
        setSelectedAccountIndex(prev => prev + 1)
      } else {
        alert("Completed all accounts in this campaign!")
        onClose()
      }
    } catch (e) {
      console.error(e)
      alert("An error occurred while saving dispositions.")
    } finally {
      setSaving(false)
    }
  }

  const mm = String(Math.floor(timerSeconds / 60)).padStart(2, "0")
  const ss = String(timerSeconds % 60).padStart(2, "0")

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-6xl h-[90vh] shadow-2xl flex flex-col overflow-hidden text-white">
        
        {/* Header */}
        <div className="flex-none px-6 py-4 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FiPhoneCall className="text-red-400 animate-pulse" /> Collections Call Campaign
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">Automated script workflow & batch invoice dispositioning</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white p-2 rounded-full bg-neutral-905 hover:bg-neutral-800 transition-colors">
            <FiX size={18} />
          </button>
        </div>

        {/* Content body split-screen */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          
          {/* Left panel - Accounts list */}
          <div className="w-1/3 border-r border-neutral-800 flex flex-col bg-neutral-950/20">
            <div className="p-4 border-b border-neutral-800 flex items-center gap-2 bg-neutral-950/40">
              <FiSearch className="text-neutral-500" />
              <input 
                type="text" 
                placeholder="Search accounts..." 
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value)
                  setSelectedAccountIndex(0)
                }}
                className="w-full bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none"
              />
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-neutral-850 scrollbar-thin">
              {accounts.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-605">No accounts require collections.</div>
              ) : (
                accounts.map((acc, idx) => {
                  const isActive = idx === selectedAccountIndex
                  return (
                    <button 
                      key={acc.customerId}
                      onClick={() => setSelectedAccountIndex(idx)}
                      className={`w-full text-left p-4 transition-colors flex justify-between items-start ${
                        isActive ? "bg-red-955 border-l-4 border-l-red-500" : "hover:bg-neutral-850/30"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className={`text-xs font-bold truncate ${isActive ? "text-red-400" : "text-white"}`}>
                          {acc.customerName}
                        </p>
                        <p className="text-[10px] text-neutral-500 mt-1">
                          Oldest: {acc.oldestInvoice ? `${acc.oldestInvoice.days_overdue}d overdue` : "N/A"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-red-400">{fmt(acc.totalBalance)}</p>
                        <span className="inline-block text-[9px] bg-neutral-850 border border-neutral-750 px-1.5 py-0.5 rounded-full text-neutral-400 mt-1">
                          {acc.invoices.length} inv
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Right panel - Script, Invoices, Disposition */}
          {activeAccount ? (
            <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
              
              {/* Customer Contact & Summary */}
              <div className="bg-neutral-950/40 border border-neutral-805 rounded-2xl p-4 flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white uppercase tracking-tight">{activeAccount.customerName}</h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-455">
                    <span className="flex items-center gap-1.5"><FiUser size={13} /> Rep: {activeAccount.invoices[0]?.salesperson_name || "Unassigned"}</span>
                    {activeAccount.invoices[0]?.salesperson_email && (
                      <span className="flex items-center gap-1.5"><FiMail size={13} /> {activeAccount.invoices[0]?.salesperson_email}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] uppercase font-bold text-neutral-500 block mb-1">Total Outstanding</span>
                  <span className="text-xl font-black text-red-400">{fmt(activeAccount.totalBalance)}</span>
                </div>
              </div>

              {/* Standardized Script */}
              <div className="bg-gradient-to-r from-red-955 to-neutral-900 border border-red-500/10 rounded-2xl p-5 space-y-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 text-[9px] uppercase font-bold text-red-500/50">Call Script</div>
                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                  <FiFileText size={13} /> Collections Script
                </h4>
                <div className="text-sm text-neutral-300 leading-relaxed font-sans border-l-2 border-red-500/30 pl-3.5 whitespace-pre-line py-1">
                  {`“Hello, is this the accounts payable department for ${activeAccount.customerName}?

                  My name is ${callerName || "[caller]"} from Titan Diamond. I am calling to follow up on some outstanding invoices on your account. 

                  Currently, you have ${Object.keys(selectedInvoices).filter(id => selectedInvoices[id]).length} outstanding invoice(s) selected, totaling ${fmt(Object.keys(selectedInvoices).filter(id => selectedInvoices[id]).reduce((sum, id) => sum + (activeAccount.invoices.find(i => i.id === id)?.balance || 0), 0))}.

                  ${activeAccount.oldestInvoice ? `Our oldest pending invoice is #${activeAccount.oldestInvoice.invoice_number}, which was due on ${activeAccount.oldestInvoice.due_date || "—"} and is currently ${activeAccount.oldestInvoice.days_overdue} days overdue.` : ""}

                  Would you like to process a credit card payment for this balance today, or could you provide a promise date for when we can expect a check payment?”`}
                </div>
              </div>

              {/* Invoices Selection List */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Select Invoices to Disposition</h4>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const all: Record<string, boolean> = {}
                        activeAccount.invoices.forEach(i => all[i.id] = true)
                        setSelectedInvoices(all)
                      }}
                      className="text-[10px] text-neutral-450 hover:text-white"
                    >
                      Select All
                    </button>
                    <button 
                      onClick={() => setSelectedInvoices({})}
                      className="text-[10px] text-neutral-450 hover:text-white"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                
                <div className="border border-neutral-800 rounded-xl overflow-hidden divide-y divide-neutral-850">
                  {activeAccount.invoices.map(inv => {
                    const checked = !!selectedInvoices[inv.id]
                    return (
                      <div 
                        key={inv.id} 
                        onClick={() => setSelectedInvoices(prev => ({ ...prev, [inv.id]: !checked }))}
                        className={`p-3.5 flex items-center justify-between text-xs transition-colors cursor-pointer ${
                          checked ? "bg-neutral-800/40" : "hover:bg-neutral-850/20"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input 
                            type="checkbox" 
                            checked={checked}
                            onChange={() => {}} // Controlled via row click
                            className="accent-red-500 cursor-pointer"
                          />
                          <div>
                            <span className="font-mono font-bold text-emerald-400">#{inv.invoice_number}</span>
                            <span className="text-neutral-505 ml-2">Due: {inv.due_date || "—"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="font-bold text-red-400">{fmt(inv.balance)}</span>
                          <span className="text-[10px] text-neutral-400 bg-neutral-800 border border-neutral-750 px-2 py-0.5 rounded">
                            {inv.days_overdue} days overdue
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Disposition Form */}
              <div className="bg-neutral-950/30 border border-neutral-800 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Log Call Outcome (Disposition)</h4>
                
                {/* Outcomes Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(OUTCOME_LABELS) as CallOutcome[]).map(k => (
                    <button 
                      key={k} 
                      onClick={() => setOutcome(k)}
                      className={`text-xs font-bold px-3 py-2.5 rounded-xl border transition-all text-left ${
                        outcome === k 
                          ? OUTCOME_COLORS[k] + " border-current" 
                          : "text-neutral-400 bg-neutral-900 border-transparent hover:border-neutral-850"
                      }`}
                    >
                      {OUTCOME_LABELS[k]}
                    </button>
                  ))}
                </div>

                {/* Optional parameters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  {/* Contact reached */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="reaching" checked={contactReached} onChange={e => setContactReached(e.target.checked)}
                        className="w-4 h-4 accent-red-500 cursor-pointer" />
                      <label htmlFor="reaching" className="text-xs font-semibold text-neutral-300 cursor-pointer">Spoke to someone?</label>
                    </div>
                    {contactReached && (
                      <input value={spokeTo} onChange={e => setSpokeTo(e.target.value)} placeholder="Who did you speak with?"
                        className="w-full bg-neutral-900 border border-neutral-850 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 font-medium" />
                    )}
                  </div>

                  {/* Promise date / follow-up */}
                  <div className="space-y-3">
                    {["promise_to_pay", "early_pay_discount"].includes(outcome) && (
                      <div>
                        <label className="text-[10px] uppercase font-bold text-neutral-400 mb-1.5 block">Promise to Pay By</label>
                        <input type="date" value={promiseDate} onChange={e => setPromiseDate(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-850 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-red-500" />
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] uppercase font-bold text-neutral-400 mb-1.5 block">Follow-up Date</label>
                      <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-850 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-red-500" />
                    </div>
                  </div>
                </div>

                {/* Duration timer */}
                <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-850 p-2 rounded-xl max-w-sm">
                  <input value={timerRunning ? `${mm}:${ss}` : duration} onChange={e => setDuration(e.target.value)}
                    placeholder="Duration (minutes)" readOnly={timerRunning}
                    className="flex-1 bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none px-2 font-mono" />
                  <button onClick={toggleTimer}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors shrink-0 ${
                      timerRunning ? "bg-red-600 hover:bg-red-550 text-white" : "bg-neutral-850 hover:bg-neutral-800 text-white border border-neutral-750"
                    }`}
                  >
                    {timerRunning ? `⏱ Stop` : "Start Timer"}
                  </button>
                </div>

                {/* Notes */}
                <textarea 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  placeholder="Summarize the details of the call & next steps..." 
                  rows={3}
                  className="w-full bg-neutral-900 border border-neutral-850 rounded-xl p-3.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 font-medium resize-none" 
                />

                {/* Save button */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? "Saving Batch Dispositions..." : "Save Disposition & Go to Next Account"}
                  </button>
                </div>

              </div>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
              Please select a collections account from the left.
            </div>
          )}

        </div>

      </div>
    </div>
  )
}

// ── Main Collections Page ──────────────────────────────────────────────
export default function CollectionsPage() {
  const { zohoContext: user } = useZoho()
  const [tab, setTab] = useState<"overdue" | "current" | "all">("overdue")
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [agingFilter, setAgingFilter] = useState("")
  const [sortBy, setSortBy] = useState("days_desc")
  const [selectedReps, setSelectedReps] = useState<string[]>([])
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false)
  
  const [callModal, setCallModal] = useState<Invoice | null>(null)
  const [showRunCardDirect, setShowRunCardDirect] = useState<Invoice | null>(null)
  const [viewingInvoiceZohoId, setViewingInvoiceZohoId] = useState<string | null>(null)
  const [showCallCampaign, setShowCallCampaign] = useState(false)
  
  const [showAllReps, setShowAllReps] = useState(false)

  const isAdmin = user?.role?.toLowerCase().includes("admin") || user?.role === "Administrator"

  useEffect(() => {
    if (user) {
      const isAdm = user.role?.toLowerCase().includes("admin") || user.role === "Administrator"
      setShowAllReps(isAdm)
    }
  }, [user])

  const fetchInvoices = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    try {
      const refreshParam = forceRefresh ? `&refresh=true&zohoId=${user?.id || ""}&email=${user?.email || ""}` : ""
      const res = await fetch(`/api/get-collections?tab=${tab}${refreshParam}`)
      const data = await res.json()
      if (data.success) {
        setInvoices(data.invoices)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [tab, user])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  // Ownership filtering: My Invoices vs All Reps
  const visibleInvoices = invoices.filter(i => {
    if (showAllReps) return true
    if (!user) return true
    const myName = user.name?.toLowerCase() || ""
    const myId = user.id || ""
    const myEmail = user.email?.toLowerCase() || ""
    
    const isSalesperson = (i.salesperson_name && myName && i.salesperson_name.toLowerCase() === myName) ||
                          (i.salesperson_id && myId && i.salesperson_id === myId) ||
                          ((i as any).salesperson_zoho_id && myId && (i as any).salesperson_zoho_id === myId) ||
                          ((i as any).salesperson_email && myEmail && (i as any).salesperson_email.toLowerCase() === myEmail)

    const isAccountOwner = ((i as any).account_owner_name && myName && (i as any).account_owner_name.toLowerCase() === myName) ||
                           ((i as any).account_owner_id && myId && (i as any).account_owner_id === myId) ||
                           ((i as any).account_owner_zoho_id && myId && (i as any).account_owner_zoho_id === myId) ||
                           ((i as any).account_owner_email && myEmail && (i as any).account_owner_email.toLowerCase() === myEmail)

    return isSalesperson || isAccountOwner
  })

  // Representative filtering
  const repFilteredInvoices = visibleInvoices.filter(i => 
    !selectedReps.length || selectedReps.includes(i.salesperson_name)
  )

  // Dynamic stats based on representative visibility
  const totalBalance = repFilteredInvoices.reduce((s, i) => s + (i.balance || 0), 0)
  const totalProfit = repFilteredInvoices.reduce((s, i) => s + (i.profit || 0), 0)
  const uniqueAccountsCount = new Set(repFilteredInvoices.map(i => i.customer_id)).size

  // Filter + sort
  const reps = [...new Set(invoices.map(i => i.salesperson_name || "Unassigned"))].sort()

  let filtered = repFilteredInvoices.filter(i => {
    const q = search.toLowerCase()
    const matchSearch = !q || i.customer_name.toLowerCase().includes(q) || i.invoice_number.toLowerCase().includes(q)
    const matchAging = !agingFilter || (() => {
      const d = i.days_overdue
      if (agingFilter === "1-30")  return d >= 1 && d <= 30
      if (agingFilter === "31-60") return d >= 31 && d <= 60
      if (agingFilter === "61-90") return d >= 61 && d <= 90
      if (agingFilter === "90+")   return d > 90
      return true
    })()
    return matchSearch && (tab === "current" || matchAging)
  })

  filtered.sort((a, b) => {
    if (sortBy === "days_desc")    return b.days_overdue - a.days_overdue
    if (sortBy === "days_asc")     return a.days_overdue - b.days_overdue
    if (sortBy === "balance_desc") return b.balance - a.balance
    if (sortBy === "balance_asc")  return a.balance - b.balance
    if (sortBy === "name_asc")     return a.customer_name.localeCompare(b.customer_name)
    return 0
  })

  const { preferences } = usePreferences()
  const defaultSize = preferences.defaultPageSize
  const pagination = usePagination(filtered, defaultSize)

  // Aging pill stats
  const pills = [
    { key: "1-30",  label: "1–30d",   cls: "border-yellow-500/40 text-yellow-400 bg-yellow-900/10" },
    { key: "31-60", label: "31–60d",  cls: "border-amber-500/40 text-amber-400 bg-amber-900/10" },
    { key: "61-90", label: "61–90d",  cls: "border-orange-500/40 text-orange-400 bg-orange-900/10" },
    { key: "90+",   label: "90+ days",cls: "border-red-500/40 text-red-400 bg-red-900/10" },
  ].map(p => {
    const bucket = repFilteredInvoices.filter(i => {
      const d = i.days_overdue
      if (p.key === "1-30")  return d >= 1 && d <= 30
      if (p.key === "31-60") return d >= 31 && d <= 60
      if (p.key === "61-90") return d >= 61 && d <= 90
      if (p.key === "90+")   return d > 90
      return false
    })
    return { ...p, count: bucket.length, amount: bucket.reduce((s, i) => s + i.balance, 0) }
  })

  const exportCSV = () => {
    const rows = [
      ["Invoice", "Customer", "Sales Rep", "Due Date", "Balance", "Days Overdue", "Status"],
      ...filtered.map(i => [
        i.invoice_number, i.customer_name, i.salesperson_name,
        i.due_date || "—", i.balance.toFixed(2), i.days_overdue, i.status
      ])
    ]
    const csv = rows.map(r => r.join(",")).join("\n")
    const a = document.createElement("a")
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv)
    a.download = `collections_${tab}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const triggerDirectEmail = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation()
    const confirmSend = window.confirm(`Send invoice email for Inv #${inv.invoice_number} to ${inv.customer_name}?`)
    if (!confirmSend) return
    
    try {
      const res = await fetch("/api/zoho-email-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: inv.id })
      })
      const data = await res.json()
      if (data.success) {
        alert(`Email for Inv #${inv.invoice_number} sent successfully!`)
      } else {
        alert("Email failed: " + data.error)
      }
    } catch (err: any) {
      alert("Error sending email: " + err.message)
    }
  }

  const activeFiltersCount = (search ? 1 : 0) + (selectedReps.length > 0 ? 1 : 0) + (agingFilter ? 1 : 0)

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "100%" }}>

      {/* Header */}
      <div className="flex-none px-5 py-3 border-b border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <FiPhoneCall className="text-red-400 animate-pulse" /> Collections Manager
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">Track overdue invoices, log calling outcomes, capture card payments</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchInvoices(true)} className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white px-3 py-1.5 bg-neutral-800 rounded-lg transition-colors border border-neutral-700/60">
              <FiRefreshCw size={13} /> Refresh
            </button>
            <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white px-3 py-1.5 bg-neutral-800 rounded-lg transition-colors border border-neutral-700/60">
              <FiDownload size={13} /> CSV
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex items-center gap-6 mt-3 pb-1">
          <div>
            <div className="text-[10px] text-neutral-500 uppercase font-semibold">Total {tab === "overdue" ? "Overdue" : "Outstanding"}</div>
            <div className="text-lg font-bold text-red-400">{fmt(totalBalance)}</div>
          </div>
          <div>
            <div className="text-[10px] text-neutral-500 uppercase font-semibold">Total Profit</div>
            <div className="text-lg font-bold text-sky-400">{fmt(totalProfit)}</div>
          </div>
          <div>
            <div className="text-[10px] text-neutral-500 uppercase font-semibold">Accounts</div>
            <div className="text-lg font-bold text-white">{uniqueAccountsCount}</div>
          </div>
          <div>
            <div className="text-[10px] text-neutral-500 uppercase font-semibold">Invoices</div>
            <div className="text-lg font-bold text-white">{filtered.length}</div>
          </div>
        </div>

        {/* Aging pills — overdue tab only */}
        {tab === "overdue" && (
          <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
            <button onClick={() => setAgingFilter("")}
              className={`shrink-0 flex flex-col items-center px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all border-orange-500/40 text-orange-400 bg-orange-900/10 ${agingFilter === "" ? "ring-1 ring-orange-500 border-orange-500" : "border-transparent"}`}>
              <span className="font-bold">All Overdue</span>
              <span className="text-[10px] opacity-75">{repFilteredInvoices.length} · {fmt(repFilteredInvoices.reduce((s, i) => s + i.balance, 0))}</span>
            </button>
            {pills.map(p => (
              <button key={p.key} onClick={() => setAgingFilter(agingFilter === p.key ? "" : p.key)}
                className={`shrink-0 flex flex-col items-center px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${p.cls} ${agingFilter === p.key ? "ring-1 ring-current border-current" : "border-transparent"}`}>
                <span className="font-bold">{p.label}</span>
                <span className="text-[10px] opacity-75">{p.count} · {fmt(p.amount)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex-none px-5 py-2 border-b border-neutral-800 bg-neutral-900 flex items-center justify-between gap-2 flex-wrap">
        {/* Tab switcher & Show All Toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-neutral-800 border border-neutral-800 rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setTab("all")} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${tab === "all" ? "bg-purple-600 text-white" : "text-neutral-400 hover:text-white"}`}>
              All
            </button>
            <button onClick={() => setTab("overdue")} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${tab === "overdue" ? "bg-red-600 text-white" : "text-neutral-400 hover:text-white"}`}>
              Overdue
            </button>
            <button onClick={() => setTab("current")} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${tab === "current" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}>
              Current
            </button>
          </div>

          <button
            onClick={() => setShowCallCampaign(true)}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-colors border border-red-500/30 bg-red-950/20 text-red-400 hover:bg-red-950/40"
          >
            <FiPhoneCall size={12} className="animate-pulse" /> Start Call Campaign
          </button>

          <button
            onClick={() => {
              setShowAllReps(!showAllReps)
              setSelectedReps([]) // Clear specific rep filter on toggle
            }}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
              showAllReps 
                ? "bg-emerald-600/80 text-white border-emerald-500 hover:bg-emerald-600" 
                : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white hover:bg-neutral-750"
            }`}
          >
            {showAllReps ? "Showing: All Sales Reps" : "Showing: My Invoices Only"}
          </button>

          {showAllReps && isAdmin && reps.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Representative:</span>
              <select
                value={selectedReps[0] || ""}
                onChange={e => setSelectedReps(e.target.value ? [e.target.value] : [])}
                className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="">All Reps</option>
                {reps.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Filters Button */}
        <div className="flex items-center gap-2">
          {activeFiltersCount > 0 && (
            <button 
              onClick={() => {
                setSearch("")
                setSelectedReps([])
                setAgingFilter("")
              }}
              className="text-[10px] text-neutral-400 hover:text-white transition-colors"
            >
              Clear Filters
            </button>
          )}
          <button
            onClick={() => setShowFiltersDrawer(true)}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-neutral-800 hover:bg-neutral-800 border rounded-lg transition-colors ${
              activeFiltersCount > 0 ? "text-emerald-400 border-emerald-500/40 bg-emerald-950/10" : "text-neutral-300 border-neutral-700/60"
            }`}
          >
            <FiFilter size={13} />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 flex items-center justify-center bg-emerald-600 text-white text-[9px] font-black rounded-full shrink-0">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Filters Popout Drawer ── */}
      {showFiltersDrawer && createPortal(
        <div className="fixed inset-0 z-[9999]">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFiltersDrawer(false)} />
          <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-neutral-900 border-l border-neutral-800 p-6 flex flex-col shadow-2xl text-white z-[9999]">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
                <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-neutral-300">
                  <FiFilter className="text-emerald-400" /> Filters
                </h2>
                <button onClick={() => setShowFiltersDrawer(false)} className="text-neutral-400 hover:text-white p-1.5 rounded-full bg-neutral-800 transition-colors">
                  <FiX size={15} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto py-4 space-y-6 scrollbar-thin">


                {/* Representative */}
                {showAllReps && isAdmin && reps.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Sales Representative</label>
                    <select 
                      value={selectedReps[0] || ""} 
                      onChange={e => setSelectedReps(e.target.value ? [e.target.value] : [])}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="">All Reps</option>
                      {reps.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                )}

                {/* Aging pills — overdue tab only */}
                {tab === "overdue" && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Aging Category</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => setAgingFilter("")}
                        className={`flex flex-col items-center p-2 rounded-lg border text-xs font-semibold transition-all border-orange-500/40 text-orange-400 bg-orange-900/10 col-span-2 ${
                          agingFilter === "" ? "ring-2 ring-orange-500 border-orange-500 bg-orange-950/20" : "border-transparent"
                        }`}
                      >
                        <span className="font-bold text-xs">All Overdue</span>
                        <span className="text-[9px] opacity-75">{repFilteredInvoices.length} · {fmt(repFilteredInvoices.reduce((s, i) => s + i.balance, 0))}</span>
                      </button>
                      {pills.map(p => (
                        <button 
                          key={p.key} 
                          onClick={() => setAgingFilter(agingFilter === p.key ? "" : p.key)}
                          className={`flex flex-col items-center p-2 rounded-lg border text-xs font-semibold transition-all ${p.cls} ${
                            agingFilter === p.key ? "ring-2 ring-emerald-500 border-emerald-500 bg-emerald-950/20" : "border-transparent"
                          }`}
                        >
                          <span className="font-bold text-xs">{p.label}</span>
                          <span className="text-[9px] opacity-75">{p.count} · {fmt(p.amount)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sort Order */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Sort Order</label>
                  <select 
                    value={sortBy} 
                    onChange={e => setSortBy(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="days_desc">Oldest First</option>
                    <option value="days_asc">Newest First</option>
                    <option value="balance_desc">Highest Balance</option>
                    <option value="balance_asc">Lowest Balance</option>
                    <option value="name_asc">Customer A–Z</option>
                  </select>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-neutral-800 flex gap-3">
                <button 
                  onClick={() => {
                    setSearch("")
                    setSelectedReps([])
                    setAgingFilter("")
                    setSortBy("days_desc")
                    setShowFiltersDrawer(false)
                  }}
                  className="flex-1 bg-neutral-800 hover:bg-neutral-800 border border-neutral-700/60 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors"
                >
                  Clear All
                </button>
                <button 
                  onClick={() => setShowFiltersDrawer(false)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors"
                >
                  Apply
                </button>
              </div>
          </div>
        </div>,
        document.body
      )}

      {/* Invoice Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-3">
            <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm animate-pulse">Loading invoices...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-600 gap-2">
            <FiCheckCircle size={40} className="text-emerald-600" />
            <p className="text-base font-semibold text-neutral-400">No invoices match your filters</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-900 border-b border-neutral-800 z-10">
              <tr>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Invoice</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Customer</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-bold hidden md:table-cell">Rep</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-bold hidden sm:table-cell">Due</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Balance</th>
                <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-bold hidden md:table-cell">Profit</th>
                <th className="text-center px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-bold hidden sm:table-cell">Aging</th>
                <th className="text-center px-4 py-2.5 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Group by rep
                const groups: Record<string, Invoice[]> = {}
                pagination.paginatedItems.forEach(inv => {
                  const rep = inv.salesperson_name || "Unassigned"
                  if (!groups[rep]) groups[rep] = []
                  groups[rep].push(inv)
                })
                return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).flatMap(([rep, invs]) => [
                  // Rep header row
                  <tr key={`grp-${rep}`} className="bg-neutral-800/40">
                    <td colSpan={8} className="px-4 py-1.5 border-b border-neutral-800/40">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs font-bold text-neutral-300">
                          <FiUser size={11} className="text-neutral-500" /> {rep}
                        </span>
                        <span className="text-[10px] text-neutral-500">{invs.length} inv · {fmt(invs.reduce((s,i) => s+i.balance, 0))} · Profit: {fmt(invs.reduce((s,i) => s+(i.profit || 0), 0))}</span>
                      </div>
                    </td>
                  </tr>,
                  ...invs.map(inv => {
                    const aging = agingBucket(inv.days_overdue)
                    return (
                      <tr key={inv.id} 
                        onClick={() => setViewingInvoiceZohoId(inv.id)}
                        className="border-b border-neutral-800/60 hover:bg-neutral-800/20 transition-all group cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-emerald-400 font-bold">
                            #{inv.invoice_number}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-white text-xs">{inv.customer_name}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-xs text-neutral-400">{inv.salesperson_name}</span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-xs text-neutral-400">{inv.due_date || "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-red-400 text-sm">{fmt(inv.balance)}</span>
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <span className="font-semibold text-sky-400 text-xs">{fmt(inv.profit || 0)}</span>
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          {tab === "overdue" ? (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${aging.cls}`}>
                              {aging.label}
                            </span>
                          ) : (
                            <span className="text-[10px] text-neutral-400">
                              Due {inv.due_date || "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => setCallModal(inv)}
                              className="p-2 bg-neutral-800 hover:bg-emerald-700 border border-neutral-700/50 hover:border-emerald-600 rounded-lg transition-colors text-neutral-400 hover:text-white" 
                              title="Log Call"
                            >
                              <FiPhoneCall size={12} />
                            </button>
                            <button onClick={(e) => triggerDirectEmail(inv, e)}
                              className="p-2 bg-neutral-800 hover:bg-blue-700 border border-neutral-700/50 hover:border-blue-600 rounded-lg transition-colors text-neutral-400 hover:text-white hidden sm:flex" 
                              title="Email Invoice"
                            >
                              <FiMail size={12} />
                            </button>
                            <button onClick={() => setShowRunCardDirect(inv)}
                              className="p-2 bg-neutral-800 hover:bg-purple-700 border border-neutral-700/50 hover:border-purple-600 rounded-lg transition-colors text-neutral-400 hover:text-white hidden sm:flex" 
                              title="Run Card"
                            >
                              <FiCreditCard size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ])
              })()}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <Pagination
          currentPage={pagination.currentPage}
          pageSize={pagination.pageSize}
          totalItems={filtered.length}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
        />
      )}

      {/* Modals */}
      {callModal && (
        <CallModal
          invoice={callModal}
          onClose={() => setCallModal(null)}
          onSaved={fetchInvoices}
        />
      )}

      {showRunCardDirect && (
        <RunCardModal
          invoice={showRunCardDirect}
          onClose={() => setShowRunCardDirect(null)}
          onSuccess={fetchInvoices}
        />
      )}

      {viewingInvoiceZohoId && (
        <InvoiceDetailsModal 
          invoice={viewingInvoiceZohoId} 
          onClose={() => setViewingInvoiceZohoId(null)} 
        />
      )}

      {showCallCampaign && (
        <CallCampaignModal
          invoices={invoices.filter(inv => inv.account?.ownerId === user?.id)}
          onClose={() => setShowCallCampaign(false)}
          onRefresh={fetchInvoices}
        />
      )}
    </div>
  )
}
