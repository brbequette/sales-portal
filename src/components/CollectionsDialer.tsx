"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import {
  FiPhoneCall, FiClock, FiCheckSquare, FiBookOpen, FiAlertCircle,
  FiChevronDown, FiChevronRight, FiFileText, FiDollarSign, FiMail,
  FiSearch, FiX, FiCreditCard, FiUser, FiCalendar, FiArrowRight,
  FiCheckCircle, FiList, FiActivity, FiTrendingUp, FiRefreshCw,
  FiExternalLink, FiFlag, FiMessageSquare
} from "react-icons/fi"
import { useZoho } from "@/components/ZohoProvider"
import { toast } from "react-hot-toast"
import { InvoiceDetailsModal } from "@/components/InvoiceDetailsModal"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type CollOutcome =
  | "left_voicemail" | "no_answer" | "promise_to_pay"
  | "early_pay_discount" | "paid_in_full" | "disputed"
  | "callback_requested" | "escalated" | "other"

const OUTCOME_LABELS: Record<CollOutcome, string> = {
  left_voicemail:     "Left Voicemail",
  no_answer:          "No Answer",
  promise_to_pay:     "Promise to Pay",
  early_pay_discount: "Discount Agreed (5%)",
  paid_in_full:       "Paid in Full",
  disputed:           "Disputed",
  callback_requested: "Callback Requested",
  escalated:          "Escalated",
  other:              "Other",
}

const OUTCOME_COLORS: Record<CollOutcome, string> = {
  left_voicemail:     "text-neutral-400 border-neutral-700 bg-neutral-800/40",
  no_answer:          "text-neutral-400 border-neutral-700 bg-neutral-800/40",
  promise_to_pay:     "text-blue-400   border-blue-800/50  bg-blue-900/20",
  early_pay_discount: "text-amber-400  border-amber-800/50 bg-amber-900/20",
  paid_in_full:       "text-emerald-400 border-emerald-800/50 bg-emerald-900/20",
  disputed:           "text-red-400    border-red-800/50   bg-red-900/20",
  callback_requested: "text-purple-400 border-purple-800/50 bg-purple-900/20",
  escalated:          "text-orange-400 border-orange-800/50 bg-orange-900/20",
  other:              "text-neutral-400 border-neutral-700 bg-neutral-800/40",
}

export type CollectionsInvoice = {
  id: string
  zohoId?: string
  invoice_number: string
  customer_name: string
  customer_id: string
  salesperson_id: string
  salesperson_name?: string
  due_date: string | null
  issue_date: string | null
  balance: number
  total: number
  status: string
  days_overdue: number
  books_invoice_id?: string | null
  profit?: number
  dead_cost?: number
  shipping_charge?: number | null
}

type Account = {
  customerId: string
  customerName: string
  invoices: CollectionsInvoice[]
  totalBalance: number
  oldestDaysOverdue: number
}

interface CollectionsDialerProps {
  invoices: CollectionsInvoice[]
  onClose: () => void
  onRefresh: () => void
  onRunCard?: (invoice: CollectionsInvoice) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0)
}

function agingBucket(days: number): { label: string; cls: string; dot: string } {
  if (days > 90) return { label: "90+ days",  cls: "text-red-400    bg-red-950/40    border-red-500/30",    dot: "bg-red-400"    }
  if (days > 60) return { label: "61–90d",    cls: "text-orange-400 bg-orange-950/40 border-orange-500/30", dot: "bg-orange-400" }
  if (days > 30) return { label: "31–60d",    cls: "text-amber-400  bg-amber-950/40  border-amber-500/30",  dot: "bg-amber-400"  }
  return               { label: "1–30d",      cls: "text-yellow-400 bg-yellow-950/40 border-yellow-500/30", dot: "bg-yellow-400" }
}

const SCRIPT_STEPS = ["Opening", "Confirm", "Resolve", "Close"] as const
type ScriptStep = 0 | 1 | 2 | 3

// ─────────────────────────────────────────────────────────────────────────────
// CollectionsDialer
// ─────────────────────────────────────────────────────────────────────────────
export function CollectionsDialer({ invoices, onClose, onRefresh, onRunCard }: CollectionsDialerProps) {
  const { zohoContext: user } = useZoho()

  // ── Queue state ──────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm]           = useState("")
  const [selectedAccountIdx, setSelectedAccountIdx] = useState(0)
  const [detailInvoice, setDetailInvoice]     = useState<CollectionsInvoice | null>(null)

  // ── Script state ─────────────────────────────────────────────────────────
  const [scriptStep, setScriptStep]           = useState<ScriptStep>(0)
  const [contactReached, setContactReached]   = useState(false)
  const [spokeTo, setSpokeTo]                 = useState("")
  const [outcome, setOutcome]                 = useState<CollOutcome>("left_voicemail")
  const [notes, setNotes]                     = useState("")
  const [promiseDate, setPromiseDate]         = useState("")
  const [followUpDate, setFollowUpDate]       = useState("")
  const [commitAmount, setCommitAmount]       = useState("")
  const [saving, setSaving]                   = useState(false)

  // ── Checklist state ──────────────────────────────────────────────────────
  const [chkPayment, setChkPayment]           = useState(false)
  const [chkEmail, setChkEmail]               = useState(false)
  const [chkFollowUp, setChkFollowUp]         = useState(false)
  const [chkNotes, setChkNotes]               = useState(false)

  // ── Timer ────────────────────────────────────────────────────────────────
  const [timerRunning, setTimerRunning]       = useState(false)
  const [timerSeconds, setTimerSeconds]       = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mm = String(Math.floor(timerSeconds / 60)).padStart(2, "0")
  const ss = String(timerSeconds % 60).padStart(2, "0")

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerRunning])

  const toggleTimer = () => {
    if (timerRunning) {
      setTimerRunning(false)
    } else {
      setTimerSeconds(0)
      setTimerRunning(true)
    }
  }

  // ── Build account queue ──────────────────────────────────────────────────
  const accounts: Account[] = useMemo(() => {
    const map: Record<string, Account> = {}
    invoices.forEach(inv => {
      const cid = inv.customer_id
      if (!map[cid]) {
        map[cid] = {
          customerId: cid,
          customerName: inv.customer_name,
          invoices: [],
          totalBalance: 0,
          oldestDaysOverdue: 0,
        }
      }
      map[cid].invoices.push(inv)
      map[cid].totalBalance += inv.balance
      if (inv.days_overdue > map[cid].oldestDaysOverdue) {
        map[cid].oldestDaysOverdue = inv.days_overdue
      }
    })
    return Object.values(map)
      .filter(a => a.customerName.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => b.totalBalance - a.totalBalance)
  }, [invoices, searchTerm])

  const activeAccount = accounts[selectedAccountIdx] ?? null

  // Reset form when account changes
  useEffect(() => {
    setScriptStep(0)
    setContactReached(false)
    setSpokeTo("")
    setOutcome("left_voicemail")
    setNotes("")
    setPromiseDate("")
    setFollowUpDate("")
    setCommitAmount("")
    setTimerRunning(false)
    setTimerSeconds(0)
    setChkPayment(false); setChkEmail(false); setChkFollowUp(false); setChkNotes(false)
  }, [selectedAccountIdx])

  // ── Save disposition ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!activeAccount) return
    setSaving(true)
    try {
      await Promise.all(
        activeAccount.invoices.map(inv =>
          fetch("/api/log-collection-call", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invoiceId: inv.id,
              outcome,
              callerName: user?.name || "",
              contactReached,
              spokeTo,
              notes: notes ? `${notes} (Collections Dialer)` : "Logged via Collections Dialer",
              promiseDate,
              followUpDate,
              commitAmount: commitAmount ? parseFloat(commitAmount) : undefined,
              durationMinutes: Math.ceil(timerSeconds / 60),
            }),
          })
        )
      )
      toast.success("Disposition saved!")
      onRefresh()
      if (selectedAccountIdx < accounts.length - 1) {
        setSelectedAccountIdx(i => i + 1)
      } else {
        toast.success("All accounts worked — great job! 🎉")
        onClose()
      }
    } catch {
      toast.error("Error saving dispositions. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // ── Script generation ────────────────────────────────────────────────────
  const generateScript = useCallback(() => {
    if (!activeAccount) return ""
    const name    = activeAccount.customerName
    const balance = fmt(activeAccount.totalBalance)
    const repName = user?.name || "your collections rep"
    const oldest  = activeAccount.oldestDaysOverdue
    const tod     = new Date().getHours() < 12 ? "morning" : "afternoon"

    switch (scriptStep) {
      case 0:
        return `"Hi, may I speak with someone in accounts payable or the person who handles your invoices?

This is ${repName} calling from Titan Diamond USA — hope you're having a great ${tod}.

I'm reaching out about your account with us. We currently show an outstanding balance of ${balance}, and I wanted to connect today to see if we can get that taken care of.

[⏸ Pause — wait for response]"`

      case 1:
        return `"Great — I'm showing the following invoices on your account:

${activeAccount.invoices.map(inv =>
  `  • INV-${inv.invoice_number} | Due: ${inv.due_date || "N/A"} | Balance: ${fmt(inv.balance)} | ${inv.days_overdue}d overdue`
).join("\n")}

Can you confirm you received these?

[If YES → 'Great, I appreciate that. Can you tell me what's preventing payment at this time?']
[If DISPUTE → 'I understand — let me note that and get someone to reach out with documentation. What's the best email for you?']"`

      case 2:
        return `"I want to make sure we get this taken care of for you today. Here are the options we can offer:

✅  Full Payment — pay the full ${balance} today via credit card, ACH, or check. We can process that right now.

📅  Payment Plan — 50% today (${fmt(activeAccount.totalBalance * 0.5)}), remainder within 30 days. Requires authorization.

📬  Commit to a Date — set a specific date you'll have this resolved and we'll note it on the account.

Which of these works best for you right now?"`

      case 3: {
        const hasCommit = commitAmount || fmt(activeAccount.totalBalance)
        const hasDate   = promiseDate || followUpDate || "[date committed]"
        return `"Just to confirm — you've agreed to pay ${hasCommit} by ${hasDate}.

You'll receive a confirmation email from us shortly.

Is there anything else I can help you with or any orders we can get going for you today?

Thank you for your time — we appreciate your business and look forward to keeping your account in good standing."`
      }
    }
  }, [activeAccount, scriptStep, user, commitAmount, promiseDate, followUpDate])

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
      <div className="glass-panel border border-white/10 rounded-3xl w-full max-w-[1400px] h-[92vh] shadow-2xl flex flex-col overflow-hidden text-white">

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div className="flex-none px-6 py-3.5 border-b border-white/10 bg-black/30 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-950/40">
                <FiPhoneCall size={14} className="text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white leading-none">Collections Call Campaign</h2>
                <p className="text-[10px] text-neutral-500 mt-0.5">Guided script · Batch disposition · Real-time tracking</p>
              </div>
            </div>

            {/* Progress pill */}
            <div className="flex items-center gap-2 glass-panel border border-white/10 px-3 py-1.5 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-[10px] font-bold text-neutral-300">
                {selectedAccountIdx + 1} / {accounts.length} accounts
              </span>
              <div className="w-24 h-1 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full transition-all duration-500"
                  style={{ width: accounts.length ? `${((selectedAccountIdx + 1) / accounts.length) * 100}%` : "0%" }}
                />
              </div>
            </div>

            {/* Timer */}
            <div className="flex items-center gap-1.5 glass-panel border border-white/10 px-3 py-1.5 rounded-full">
              <FiClock size={11} className={timerRunning ? "text-red-400 animate-pulse" : "text-neutral-500"} />
              <span className="text-[11px] font-mono font-bold text-white">{mm}:{ss}</span>
              <button
                onClick={toggleTimer}
                className={`ml-1 px-2 py-0.5 rounded-full text-[9px] font-bold transition-all cursor-pointer ${
                  timerRunning
                    ? "bg-red-600 hover:bg-red-500 text-white"
                    : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                }`}
              >
                {timerRunning ? "Stop" : "Start"}
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer"
          >
            <FiX size={16} />
          </button>
        </div>

        {/* ── BODY ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* ═══ LEFT PANEL — Account Queue ══════════════════════════════ */}
          <div className="w-[260px] shrink-0 border-r border-white/10 flex flex-col bg-black/20">
            <div className="p-3 border-b border-white/10 flex items-center gap-2">
              <FiSearch size={13} className="text-neutral-500 shrink-0" />
              <input
                type="text"
                placeholder="Search accounts..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setSelectedAccountIdx(0) }}
                className="w-full bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {accounts.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-neutral-500">No accounts in queue</div>
              ) : accounts.map((acc, idx) => {
                const isActive = idx === selectedAccountIdx
                const bucket   = agingBucket(acc.oldestDaysOverdue)
                const initials = acc.customerName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
                return (
                  <button
                    key={acc.customerId}
                    onClick={() => setSelectedAccountIdx(idx)}
                    className={`w-full text-left px-3 py-3 transition-all flex items-start gap-2.5 border-l-2 ${
                      isActive
                        ? "border-l-red-500 bg-red-950/20"
                        : "border-l-transparent hover:bg-white/5"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                      isActive
                        ? "bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-lg shadow-red-950/50"
                        : "bg-neutral-800 text-neutral-400"
                    }`}>
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[11px] font-bold truncate leading-tight ${isActive ? "text-red-300" : "text-white"}`}>
                        {acc.customerName}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] font-bold text-red-400">{fmt(acc.totalBalance)}</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${bucket.cls}`}>
                          {bucket.label}
                        </span>
                      </div>
                      <p className="text-[9px] text-neutral-600 mt-0.5">{acc.invoices.length} invoice{acc.invoices.length !== 1 ? "s" : ""}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ═══ CENTER PANEL — Script + Disposition ═════════════════════ */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {activeAccount ? (
              <>
                {/* Account header bar */}
                <div className="flex-none px-5 py-3 border-b border-white/10 bg-black/20 flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-sm font-black text-white shadow-lg shadow-red-950/40">
                      {activeAccount.customerName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white leading-none">{activeAccount.customerName}</h3>
                      <p className="text-[10px] text-neutral-500 mt-0.5">{activeAccount.invoices.length} overdue invoice{activeAccount.invoices.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-500 font-semibold">Total Owed:</span>
                    <span className="text-sm font-black text-red-400">{fmt(activeAccount.totalBalance)}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-500 font-semibold">Oldest:</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${agingBucket(activeAccount.oldestDaysOverdue).cls}`}>
                      {activeAccount.oldestDaysOverdue}d overdue
                    </span>
                  </div>

                  {/* Contact reached toggle */}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[10px] font-bold text-neutral-400">Contact Reached:</span>
                    <div className="flex bg-black/30 border border-white/10 rounded p-0.5">
                      <button
                        onClick={() => { setContactReached(true); setOutcome("promise_to_pay") }}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${contactReached ? "bg-emerald-600 text-white" : "text-neutral-500 hover:text-neutral-300"}`}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => { setContactReached(false); setOutcome("left_voicemail") }}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${!contactReached ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-neutral-300"}`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  {contactReached && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-neutral-400">Spoke With:</span>
                      <input
                        type="text"
                        placeholder="Name..."
                        value={spokeTo}
                        onChange={e => setSpokeTo(e.target.value)}
                        className="w-28 bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}
                </div>

                {/* Step nav */}
                <div className="flex-none px-5 pt-3.5 pb-0">
                  <div className="flex items-center gap-1.5">
                    {SCRIPT_STEPS.map((label, i) => {
                      const isActive = scriptStep === i
                      const isDone   = scriptStep > i
                      return (
                        <button
                          key={label}
                          onClick={() => setScriptStep(i as ScriptStep)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                            isActive
                              ? "bg-gradient-to-r from-red-600 to-orange-500 text-white border-red-500/50 shadow-lg shadow-red-950/30"
                              : isDone
                              ? "bg-emerald-900/30 text-emerald-400 border-emerald-700/40"
                              : "bg-black/20 text-neutral-500 border-neutral-800 hover:text-neutral-300"
                          }`}
                        >
                          {isDone ? <FiCheckCircle size={9} /> : <span className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[8px]">{i + 1}</span>}
                          {label}
                          {i < SCRIPT_STEPS.length - 1 && (
                            <FiChevronRight size={10} className="text-neutral-700 ml-0.5" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Scrollable center content */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin">

                  {/* ── SCRIPT BOX ── */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                        <FiBookOpen size={11} /> Collections Script — Step {scriptStep + 1}: {SCRIPT_STEPS[scriptStep]}
                      </span>
                      {scriptStep < 3 && (
                        <button
                          onClick={() => setScriptStep(s => Math.min(s + 1, 3) as ScriptStep)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-red-700/60 to-orange-700/60 border border-red-600/30 hover:border-red-500/50 rounded-full text-[9px] font-bold text-red-300 transition-all cursor-pointer"
                        >
                          Next Step <FiArrowRight size={9} />
                        </button>
                      )}
                    </div>
                    <div className="bg-black/30 border-l-2 border-l-red-500/60 border border-red-900/30 p-4 rounded-r-xl text-[12px] text-neutral-200 leading-relaxed whitespace-pre-line select-text font-mono">
                      {generateScript()}
                    </div>
                  </div>

                  {/* ── INVOICE LIST (Step 1 / 2 — always visible) ── */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5 mb-2">
                      <FiList size={11} /> Overdue Invoices ({activeAccount.invoices.length})
                    </span>
                    <div className="space-y-1.5">
                      {activeAccount.invoices.map(inv => {
                        const bucket = agingBucket(inv.days_overdue)
                        return (
                          <div key={inv.id} className="flex items-center gap-3 glass-panel border border-neutral-800/60 rounded-xl px-3.5 py-2.5 text-[11px]">
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${bucket.dot}`} />
                            <button
                              type="button"
                              onClick={() => setDetailInvoice(inv)}
                              className="font-bold text-emerald-400 font-mono min-w-[90px] hover:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded transition-all text-left"
                              title="Click to view full invoice details, line items, and PDF"
                            >
                              <FiFileText size={11} className="text-emerald-400" />
                              INV-{inv.invoice_number}
                            </button>
                            <span className="text-neutral-500 text-[10px]">Due: {inv.due_date || "N/A"}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${bucket.cls} ml-auto`}>{inv.days_overdue}d</span>
                            <span className="font-black text-red-400 min-w-[70px] text-right">{fmt(inv.balance)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── RESOLUTION OPTIONS (Step 3) ── */}
                  {scriptStep >= 2 && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5 mb-2">
                        <FiDollarSign size={11} /> Resolution Options
                      </span>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { icon: "✅", title: "Full Payment", desc: `Collect ${fmt(activeAccount.totalBalance)} today via card, ACH, or check.`, highlight: true },
                          { icon: "📅", title: "Payment Plan", desc: `50% today (${fmt(activeAccount.totalBalance * 0.5)}), remainder within 30 days. Auth required.`, highlight: false },
                          { icon: "📬", title: "Commit to Date", desc: "Customer commits to a specific payment date. Log it and set follow-up.", highlight: false },
                        ].map(opt => (
                          <div key={opt.title} className={`flex flex-col gap-1.5 p-3 rounded-xl border transition-all ${
                            opt.highlight
                              ? "border-emerald-700/50 bg-emerald-950/20"
                              : "border-neutral-800/60 bg-black/20 hover:border-neutral-700"
                          }`}>
                            <span className="text-base">{opt.icon}</span>
                            <span className="text-[11px] font-bold text-white">{opt.title}</span>
                            <span className="text-[10px] text-neutral-400 leading-relaxed">{opt.desc}</span>
                          </div>
                        ))}
                      </div>

                      {/* Commitment inputs */}
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <div className="flex-1 min-w-[140px]">
                          <label className="text-[9px] uppercase font-bold text-neutral-500 mb-1 block">Promise Amount</label>
                          <input
                            type="text"
                            placeholder={`e.g. ${fmt(activeAccount.totalBalance)}`}
                            value={commitAmount}
                            onChange={e => setCommitAmount(e.target.value)}
                            className="w-full glass-panel border border-neutral-800 rounded-lg px-3 py-2 text-[11px] text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div className="flex-1 min-w-[140px]">
                          <label className="text-[9px] uppercase font-bold text-neutral-500 mb-1 block">Promise to Pay By</label>
                          <input
                            type="date"
                            value={promiseDate}
                            onChange={e => setPromiseDate(e.target.value)}
                            className="w-full glass-panel border border-neutral-800 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div className="flex-1 min-w-[140px]">
                          <label className="text-[9px] uppercase font-bold text-neutral-500 mb-1 block">Follow-up Date</label>
                          <input
                            type="date"
                            value={followUpDate}
                            onChange={e => setFollowUpDate(e.target.value)}
                            className="w-full glass-panel border border-neutral-800 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none focus:border-neutral-600"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── CLOSE CHECKLIST (Step 4) ── */}
                  {scriptStep === 3 && (
                    <div className="glass-panel border border-neutral-800 rounded-xl p-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5 mb-3">
                        <FiCheckSquare size={11} /> Closing Checklist
                      </span>
                      <div className="space-y-2.5">
                        {[
                          { id: "payment", label: "Payment collected or date committed", val: chkPayment, set: setChkPayment },
                          { id: "email",   label: "Confirmation email sent or promised",   val: chkEmail,   set: setChkEmail   },
                          { id: "followup",label: "Follow-up task created / date set",    val: chkFollowUp,set: setChkFollowUp },
                          { id: "notes",   label: "Call notes fully documented",           val: chkNotes,   set: setChkNotes   },
                        ].map(item => (
                          <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
                            <div
                              onClick={() => item.set(!item.val)}
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                                item.val ? "bg-emerald-600 border-emerald-500" : "border-neutral-600 group-hover:border-neutral-500"
                              }`}
                            >
                              {item.val && <FiCheckCircle size={10} className="text-white" />}
                            </div>
                            <span className={`text-[11px] font-medium transition-colors ${item.val ? "text-emerald-400 line-through" : "text-neutral-300"}`}>
                              {item.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── OUTCOME SELECTOR ── */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5 mb-2">
                      <FiActivity size={11} /> Call Outcome
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(OUTCOME_LABELS) as CollOutcome[]).map(key => (
                        <button
                          key={key}
                          onClick={() => setOutcome(key)}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                            outcome === key
                              ? OUTCOME_COLORS[key] + " ring-1 ring-current scale-105"
                              : "border-neutral-800 text-neutral-500 bg-transparent hover:border-neutral-700 hover:text-neutral-300"
                          }`}
                        >
                          {OUTCOME_LABELS[key]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── NOTES ── */}
                  <div>
                    <label className="text-[9px] uppercase font-bold text-neutral-500 mb-1.5 block">Call Notes</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Summarize what was discussed, commitments made, next steps..."
                      rows={3}
                      className="w-full glass-panel border border-neutral-800 rounded-xl px-3.5 py-2.5 text-[11px] text-white placeholder-neutral-600 focus:outline-none focus:border-red-500 resize-none font-medium"
                    />
                  </div>
                </div>

                {/* ── BOTTOM ACTION BAR ── */}
                <div className="flex-none px-5 py-3 border-t border-white/10 bg-black/20 flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                    <FiClock size={10} />
                    <span className="font-mono">{mm}:{ss}</span>
                    <span>call duration</span>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => setSelectedAccountIdx(i => Math.max(i - 1, 0))}
                      disabled={selectedAccountIdx === 0}
                      className="px-4 py-2 text-[10px] font-bold text-neutral-400 hover:text-white border border-neutral-800 hover:border-neutral-700 rounded-xl transition-all disabled:opacity-30 cursor-pointer"
                    >
                      ← Prev
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-6 py-2 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white text-[11px] font-black rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-red-950/40 cursor-pointer flex items-center gap-2"
                    >
                      {saving ? "Saving..." : "Save & Next Account →"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <FiAlertCircle size={32} className="text-neutral-700 mx-auto" />
                  <p className="text-sm text-neutral-500">Select an account from the left to begin</p>
                </div>
              </div>
            )}
          </div>

          {/* ═══ RIGHT PANEL — Account Intel ══════════════════════════════ */}
          <div className="w-[280px] shrink-0 border-l border-white/10 flex flex-col overflow-hidden bg-black/20">
            <div className="flex-none px-4 py-3 border-b border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <FiTrendingUp size={11} /> Account Intel
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-thin">
              {activeAccount ? (
                <>
                  {/* Debt summary */}
                  <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-3 space-y-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-red-400">Debt Summary</span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Total Owed",   val: fmt(activeAccount.totalBalance),        cls: "text-red-400"    },
                        { label: "# Invoices",   val: String(activeAccount.invoices.length),  cls: "text-white"      },
                        { label: "Oldest",        val: `${activeAccount.oldestDaysOverdue}d`, cls: "text-orange-400" },
                        { label: "Avg Invoice",  val: fmt(activeAccount.totalBalance / Math.max(activeAccount.invoices.length, 1)), cls: "text-neutral-300" },
                      ].map(stat => (
                        <div key={stat.label} className="glass-panel border border-neutral-800/60 rounded-lg p-2">
                          <p className="text-[8px] text-neutral-600 uppercase tracking-wide">{stat.label}</p>
                          <p className={`text-sm font-black ${stat.cls}`}>{stat.val}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Aging breakdown */}
                  <div className="glass-panel border border-neutral-800/60 rounded-xl p-3 space-y-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">Aging Breakdown</span>
                    {activeAccount.invoices.map(inv => {
                      const bucket = agingBucket(inv.days_overdue)
                      const pct = activeAccount.totalBalance > 0 ? (inv.balance / activeAccount.totalBalance) * 100 : 0
                      return (
                        <div key={inv.id} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[9px]">
                            <span className="text-neutral-400 font-mono">INV-{inv.invoice_number}</span>
                            <span className={`font-bold ${bucket.cls.split(" ")[0]}`}>{fmt(inv.balance)}</span>
                          </div>
                          <div className="h-1 bg-neutral-900 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${bucket.dot}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Quick actions */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">Quick Actions</span>
                    {[
                      {
                        icon: <FiCreditCard size={12} />,
                        label: "Run Card Now",
                        cls:   "border-emerald-800/50 text-emerald-400 hover:bg-emerald-950/30",
                        action: () => onRunCard && activeAccount.invoices[0] && onRunCard(activeAccount.invoices[0])
                      },
                      {
                        icon: <FiMail size={12} />,
                        label: "Email Invoice Copies",
                        cls:   "border-blue-800/50 text-blue-400 hover:bg-blue-950/30",
                        action: () => toast("Email feature — open Zoho to send copies", { icon: "📧" })
                      },
                      {
                        icon: <FiExternalLink size={12} />,
                        label: "View in Zoho Books",
                        cls:   "border-neutral-700 text-neutral-300 hover:bg-white/5",
                        action: () => {
                          if (activeAccount.invoices[0]?.books_invoice_id) {
                            window.open(`https://books.zoho.com/app/titandiamondllc#/invoices/${activeAccount.invoices[0].books_invoice_id}`, "_blank", "noopener")
                          }
                        }
                      },
                      {
                        icon: <FiFlag size={12} />,
                        label: "Escalate Account",
                        cls:   "border-red-800/50 text-red-400 hover:bg-red-950/30",
                        action: () => { setOutcome("escalated"); toast("Account flagged for escalation", { icon: "🚨" }) }
                      },
                    ].map(btn => (
                      <button
                        key={btn.label}
                        onClick={btn.action}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${btn.cls}`}
                      >
                        {btn.icon}
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* Campaign progress stats */}
                  <div className="glass-panel border border-neutral-800/60 rounded-xl p-3 space-y-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">Session Progress</span>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-neutral-500">Accounts worked</span>
                        <span className="font-bold text-white">{selectedAccountIdx + 1} / {accounts.length}</span>
                      </div>
                      <div className="h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full transition-all duration-500"
                          style={{ width: accounts.length ? `${((selectedAccountIdx + 1) / accounts.length) * 100}%` : "0%" }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-neutral-500">Remaining</span>
                        <span className="font-bold text-orange-400">{fmt(accounts.slice(selectedAccountIdx).reduce((s, a) => s + a.totalBalance, 0))}</span>
                      </div>
                    </div>
                  </div>

                </>
              ) : (
                <div className="flex items-center justify-center h-32">
                  <p className="text-[11px] text-neutral-600">Select an account</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {detailInvoice && (
        <InvoiceDetailsModal
          invoice={detailInvoice.zohoId || detailInvoice.id || detailInvoice.books_invoice_id || detailInvoice}
          type="Invoice"
          onClose={() => setDetailInvoice(null)}
        />
      )}
    </div>
  )
}
