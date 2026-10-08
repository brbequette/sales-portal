"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { ReturnAddress, ReturnLine, ReturnSnapshot } from "@/lib/invoice-return"
import { returnCreditEstimate } from "@/lib/invoice-return"

type Rate = { courierServiceId: string; courierName: string; totalCharge: number; minDeliveryTime: number | null; maxDeliveryTime: number | null }
type SavedReturn = { id: string; reason: string; status: string; snapshot: ReturnSnapshot; rates: Rate[] | null; costResponsibility: string; quotedCostCents: number | null; actualCostCents: number | null; proposedCreditCents: number | null; recoveredCostCents: number | null; creditedCents: number | null; labelUrl: string | null; trackingNumber: string | null; trackingUrl: string | null; shipmentId: string | null; lastError: string | null; receivedAt: string | null; inspection: { notes?: string; booksBalanceAtVerification?: number } | null }
type Context = { origin: ReturnAddress; destination: ReturnAddress; lines: ReturnLine[]; returns: SavedReturn[]; canManage: boolean; booksInvoiceId: string }
const money = (cents: number | null | undefined) => cents == null ? "Awaiting confirmation" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
const input = "w-full rounded-lg border border-white/20 bg-neutral-900 px-3 py-2 text-sm text-white"
const button = "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
const addressFields: [keyof ReturnAddress, string][] = [["contact_name", "Contact name"], ["company_name", "Company"], ["contact_phone", "Phone"], ["contact_email", "Email (optional)"], ["line_1", "Street address"], ["line_2", "Suite / unit (optional)"], ["city", "City"], ["state", "State"], ["postal_code", "ZIP code"]]

async function fetchReturnContext(invoiceId: string): Promise<Context> {
  const response = await fetch(`/api/easyship-return?invoiceId=${encodeURIComponent(invoiceId)}`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Unable to load return details.")
  return data
}

export default function InvoiceReturnModal({ invoice, onClose, onSuccess }: { invoice: { id: string; invoice_number?: string; customer_name?: string }; onClose: () => void; onSuccess: () => void }) {
  const [context, setContext] = useState<Context | null>(null)
  const [origin, setOrigin] = useState<ReturnAddress | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [box, setBox] = useState({ length: "", width: "", height: "", weight: "" })
  const [reason, setReason] = useState("")
  const [payer, setPayer] = useState("")
  const [active, setActive] = useState<SavedReturn | null>(null)
  const [rateId, setRateId] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState("")
  const [accepted, setAccepted] = useState<Record<string, string>>({})
  const [creditNoteId, setCreditNoteId] = useState("")
  const [creditAmount, setCreditAmount] = useState("")
  const requestId = useRef<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const lock = useRef(false)
  const close = () => { onSuccess(); onClose() }
  const load = async () => {
    const data = await fetchReturnContext(invoice.id)
    setContext(data); setOrigin(current => current || data.origin)
    return data as Context
  }
  useEffect(() => {
    let live = true
    fetchReturnContext(invoice.id).then(data => { if (live) { setContext(data); setOrigin(data.origin) } }).catch(error => { if (live) setError(error.message) })
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    return () => { live = false; previous?.focus() }
  }, [invoice.id])
  const select = (row: SavedReturn) => { setActive(row); setRateId(""); setAccepted({}); setNotes(""); setCreditNoteId(""); setCreditAmount(""); setError("") }
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError("")
    try {
      const response = await fetch("/api/easyship-return", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId: invoice.id, returnId: active?.id || requestId.current, action, ...extra }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to save return.")
      if (data.return) setActive(data.return)
      await load()
    } catch (error) {
      setError((error as Error).message)
      // Recover a durable request after a lost response instead of creating another.
      try { const fresh = await load(); const saved = fresh.returns.find(row => row.id === (active?.id || requestId.current)); if (saved) setActive(saved) } catch { /* Retain the request ID for retry. */ }
    } finally { lock.current = false; setBusy(false) }
  }
  const rates = active?.rates || []
  const rate = rates.find(item => item.courierServiceId === rateId)
  const reserved: Record<string, number> = {}
  for (const row of context?.returns || []) if (!["CANCELLED", "QUOTE_FAILED"].includes(row.status)) for (const line of row.snapshot.lines) reserved[line.lineId] = (reserved[line.lineId] || 0) + line.quantity
  const selectedLines = (lines: ReturnLine[], values: Record<string, string>) => lines.filter(line => Number(values[line.lineId]) > 0).map(line => ({ lineId: line.lineId, quantity: Number(values[line.lineId]) }))
  const estimate = active ? returnCreditEstimate(active.snapshot.lines, active.costResponsibility, active.actualCostCents) : null
  const freight = (context?.returns || []).reduce((sum, row) => sum + (row.actualCostCents || 0), 0)
  const hasPendingCost = context?.returns.some(row => row.shipmentId && row.actualCostCents === null)
  return createPortal(<div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" onKeyDown={event => {
    if (event.key === "Escape" && !busy) close()
    if (event.key === "Tab") {
      const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')
      const first = elements?.[0], last = elements?.[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="return-title" className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#10151c] text-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-white/10 p-5"><div><h2 id="return-title" className="text-lg font-bold">Return to Scottsdale</h2><p className="text-sm text-neutral-400">Invoice {invoice.invoice_number} · {invoice.customer_name}</p></div><button disabled={busy} onClick={close} aria-label="Close return" className="px-3 py-1 text-xl">×</button></header>
      <div className="space-y-5 overflow-y-auto p-5">
        {error && <p role="alert" className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
        {!context ? <p>Loading invoice and saved returns…</p> : <>
          <p className="text-sm text-neutral-300">1. Select items and package → 2. Review and buy label → 3. Receive and inspect → 4. Reconcile credit</p>
          <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/20 p-4"><p className="text-xs uppercase text-emerald-300">All returns arrive here</p><p className="mt-1 font-semibold">{context.destination.company_name}</p><p className="text-sm">{context.destination.line_1}, {context.destination.line_2}<br />{context.destination.city}, {context.destination.state} {context.destination.postal_code}</p></div>
          {!!context.returns.length && <section className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Saved returns</h3><p className="text-sm text-neutral-400">Recorded inbound freight: {money(freight)}{hasPendingCost ? " + unconfirmed charges" : ""}</p></div><div className="flex flex-wrap gap-2">{context.returns.map(row => <button key={row.id} disabled={busy} onClick={() => select(row)} className={`rounded-lg border px-3 py-2 text-left text-xs ${active?.id === row.id ? "border-red-500 bg-red-950/30" : "border-white/20"}`}><span className="block font-semibold">{row.reason}</span>{row.status.replaceAll("_", " ")} · {row.id.slice(0, 8)}</button>)}<button disabled={busy} onClick={() => { setActive(null); requestId.current = null; setError("") }} className="rounded-lg border border-white/20 px-3 py-2 text-sm">New return</button></div></section>}
          {!active ? <form className="space-y-5" onSubmit={event => { event.preventDefault(); requestId.current ||= crypto.randomUUID(); void act("quote", { reason, origin, box, costResponsibility: payer, lines: selectedLines(context.lines, quantities) }) }}>
            <fieldset disabled={busy} className="space-y-3"><legend className="mb-2 font-semibold">Ship from the client</legend><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{addressFields.map(([key, label]) => <label key={key} className="text-xs text-neutral-300">{label}<input className={`${input} mt-1`} value={origin?.[key] || ""} required={!["company_name", "contact_email", "line_2"].includes(key)} onChange={event => setOrigin(value => value && ({ ...value, [key]: event.target.value }))} /></label>)}</div><p className="text-xs text-neutral-400">US domestic returns. Confirm the client’s actual pickup address.</p></fieldset>
            <fieldset disabled={busy}><legend className="mb-2 font-semibold">Items being returned</legend><div className="space-y-2">{context.lines.map(line => <label key={line.lineId} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3"><span className="text-sm">{line.name}<span className="block text-xs text-neutral-400">{line.sku} · {money(Math.round(line.unitCredit * 100))} each · {Math.max(0, line.quantity - (reserved[line.lineId] || 0))} available{line.dropshipped ? " · Dropshipped" : ""}</span></span><input aria-label={`Return quantity for ${line.name} (${line.lineId})`} className={`${input} !w-24`} type="number" min="0" max={Math.max(0, line.quantity - (reserved[line.lineId] || 0))} step="any" placeholder="0" value={quantities[line.lineId] || ""} onChange={event => setQuantities(values => ({ ...values, [line.lineId]: event.target.value }))} /></label>)}</div></fieldset>
            <fieldset disabled={busy}><legend className="mb-2 font-semibold">Measured package — one box</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(["length", "width", "height", "weight"] as const).map(key => <label key={key} className="text-xs capitalize text-neutral-300">{key} ({key === "weight" ? "lb" : "in"})<input className={`${input} mt-1`} required type="number" min="0.1" max="1000" step="any" value={box[key]} onChange={event => setBox(values => ({ ...values, [key]: event.target.value }))} /></label>)}</div><p className="mt-2 text-xs text-neutral-400">Include the box and packing material in the total weight.</p></fieldset>
            <label className="block text-sm">Reason for return<input className={`${input} mt-1`} required maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label>
            <label className="block text-sm">Who pays return freight?<select required className={`${input} mt-1`} disabled={busy} value={payer} onChange={event => setPayer(event.target.value)}><option value="">Choose for this return</option><option value="TITAN">Titan pays — keep freight as a company cost</option><option value="CUSTOMER">Customer pays — propose a deduction from credit</option></select></label>
            <p className="text-xs text-neutral-400">Getting rates does not buy a label or change the invoice balance.</p><button className={button} disabled={busy}>{busy ? "Getting rates…" : "Review shipping rates"}</button>
          </form> : <section className="space-y-4">
            <div className="rounded-xl bg-white/5 p-4 text-sm"><p className="font-semibold">{active.status.replaceAll("_", " ")}</p><p className="mt-1 break-all text-xs text-neutral-400">RMA-{active.id}{active.shipmentId ? ` · Shipment ${active.shipmentId}` : ""}</p><p className="mt-3">From: {active.snapshot.origin.contact_name}, {active.snapshot.origin.line_1}, {active.snapshot.origin.city} {active.snapshot.origin.state} {active.snapshot.origin.postal_code}</p><p>{active.snapshot.box.length} × {active.snapshot.box.width} × {active.snapshot.box.height} in · {active.snapshot.box.weight} lb</p>{active.snapshot.lines.map(line => <p key={line.lineId}>{line.quantity} × {line.name} · {money(Math.round(line.unitCredit * line.quantity * 100))}</p>)}<p className="mt-2">Freight paid by: {active.costResponsibility === "TITAN" ? "Titan" : "Customer (deduct from credit)"}</p></div>
            {active.lastError && <p role="alert" className="rounded-lg bg-amber-950/30 p-3 text-sm text-amber-200">{active.lastError}</p>}
            {active.status === "QUOTED" && <><h3 className="font-semibold">Choose a service</h3>{rates.map(item => <label key={item.courierServiceId} className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/20 p-3"><input type="radio" name="return-rate" disabled={busy} checked={rateId === item.courierServiceId} onChange={() => setRateId(item.courierServiceId)} /><span className="flex-1 text-sm">{item.courierName}{item.minDeliveryTime != null ? ` · ${item.minDeliveryTime}–${item.maxDeliveryTime ?? item.minDeliveryTime} business days` : ""}</span><strong>{money(Math.round(item.totalCharge * 100))}</strong></label>)}<p className="text-xs text-neutral-400">Rates are valid for 15 minutes. Buying charges the Easyship account. Carrier adjustments may arrive later.</p><button disabled={busy || !rate} className={button} onClick={() => rate && act("purchase", { courierServiceId: rate.courierServiceId, approvedCostCents: Math.round(rate.totalCharge * 100) })}>{busy ? "Saving label request…" : `Buy return label${rate ? ` — ${money(Math.round(rate.totalCharge * 100))}` : ""}`}</button></>}
            {["QUOTING", "QUOTED", "QUOTE_FAILED"].includes(active.status) && <button className="ml-2 text-sm underline" disabled={busy} onClick={() => act("cancel")}>Cancel this quote</button>}
            {active.shipmentId && <div className="flex flex-wrap gap-4"><button disabled={busy} className="text-sm underline" onClick={() => act("refresh")}>Refresh existing shipment and cost</button>{active.labelUrl && <a className={button} target="_blank" rel="noopener noreferrer" href={active.labelUrl}>Print return label</a>}{active.trackingUrl ? <a className="text-sm underline" target="_blank" rel="noopener noreferrer" href={active.trackingUrl}>Track {active.trackingNumber}</a> : active.trackingNumber && <span className="text-sm">Tracking: {active.trackingNumber}</span>}</div>}
            {["LABEL_PENDING", "PURCHASE_REQUESTED", "RECONCILE_REQUIRED"].includes(active.status) && <p className="text-sm text-amber-200">Keep this saved return. Refresh the existing shipment or have Shipping reconcile its RMA reference in Easyship before making another label.</p>}
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 p-4 text-sm sm:grid-cols-2"><p>Return merchandise, before tax: <strong>{money(estimate?.merchandiseCents)}</strong></p><p>Actual return freight: <strong>{money(active.actualCostCents)}</strong></p><p>Proposed credit after inspection, before tax: <strong>{active.receivedAt ? money(active.proposedCreditCents) : "Awaiting inspection"}</strong></p><p>Credit verified in Books: <strong>{active.creditedCents == null ? "Not reconciled" : money(active.creditedCents)}</strong></p></div>
            {active.status === "LABEL_READY" && context.canManage && <form className="space-y-3 rounded-xl border border-white/15 p-4" onSubmit={event => { event.preventDefault(); void act("receive", { lines: selectedLines(active.snapshot.lines, accepted), notes }) }}><h3 className="font-semibold">Record office receipt and inspection</h3><p className="text-xs text-neutral-400">Enter quantities accepted for customer credit. Zero means rejected or not received. This records the inspection; inventory, supplier recovery and commissions require their normal review.</p>{active.snapshot.lines.map(line => <label key={line.lineId} className="flex items-center justify-between gap-3 text-sm">{line.name} (up to {line.quantity})<input aria-label={`Accepted quantity for ${line.name} (${line.lineId})`} type="number" min="0" max={line.quantity} step="any" className={`${input} !w-24`} value={accepted[line.lineId] || ""} placeholder="0" disabled={busy} onChange={event => setAccepted(values => ({ ...values, [line.lineId]: event.target.value }))} /></label>)}<label className="block text-sm">Condition, discrepancies and restock instructions<textarea required maxLength={2000} className={`${input} mt-1`} disabled={busy} value={notes} onChange={event => setNotes(event.target.value)} /></label><button className={button} disabled={busy}>Confirm received and inspected</button></form>}
            {active.receivedAt && <p className="text-sm text-neutral-300">Inspection: {active.inspection?.notes}<br />Accepted-item cost basis: {money(active.recoveredCostCents)}. This is not a confirmed inventory or supplier recovery.</p>}
            {active.status === "CREDIT_PENDING" && context.canManage && <form className="space-y-3 rounded-xl border border-white/15 p-4" onSubmit={event => { event.preventDefault(); void act("reconcile-credit", { creditNoteId, expectedCreditCents: Math.round(Number(creditAmount) * 100) }) }}><h3 className="font-semibold">Reconcile the invoice credit</h3><p className="text-sm text-neutral-300">Create and apply the credit in Zoho Books after reviewing accepted items, tax, discounts and freight. Paste the credit-note ID from its Books URL to verify it against this invoice. Outbound freight remains separate.</p><a className="inline-block text-sm underline" href={`https://books.zoho.com/app/664670946#/invoices/${context.booksInvoiceId}`} target="_blank" rel="noopener noreferrer">Open invoice in Zoho Books</a><label className="block text-sm">Posted credit-note ID<input className={`${input} mt-1`} required pattern="[0-9]{10,}" disabled={busy} value={creditNoteId} onChange={event => setCreditNoteId(event.target.value)} /></label><label className="block text-sm">Credit applied for this return, including tax ($)<input className={`${input} mt-1`} type="number" min="0.01" step="0.01" required disabled={busy} value={creditAmount} onChange={event => setCreditAmount(event.target.value)} /></label><button className={button} disabled={busy}>Verify applied credit</button>{active.proposedCreditCents === 0 && <button type="button" className="ml-3 text-sm underline" disabled={busy} onClick={() => act("close-no-credit")}>Close with no customer credit</button>}</form>}
            {active.status === "CREDIT_VERIFIED" && <p className="text-sm text-emerald-300">Books credit verified. Invoice balance at verification: {money(Math.round((active.inspection?.booksBalanceAtVerification || 0) * 100))}. The normal Books sync updates Collections.</p>}
          </section>}
        </>}
      </div>
    </div>
  </div>, document.body)
}
