"use client"

/* Account detail is a provider-normalized aggregate that does not yet expose a shared static type. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { FiBriefcase, FiClock, FiDollarSign, FiEdit3, FiFileText, FiImage, FiMail, FiMapPin, FiPrinter, FiSearch, FiSend, FiTarget, FiUsers } from "react-icons/fi"
import { CommunicationCenter } from "@/components/CommunicationCenter"

type WorkspaceTab = "communications" | "account" | "timeline" | "campaigns" | "creative" | "postal"

type TimelineEvent = {
  id: string
  channel: string
  direction?: string | null
  eventType: string
  subject?: string | null
  summary?: string | null
  occurredAt: string
  actor?: { name?: string | null } | null
  contact?: { firstName?: string | null; lastName?: string | null } | null
}

function CommunicationTimeline({ accountId }: { accountId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [channel, setChannel] = useState("ALL")
  const [query, setQuery] = useState("")

  useEffect(() => {
    let active = true
    fetch(`/api/communications/timeline/${encodeURIComponent(accountId)}?limit=250`, { cache: "no-store" })
      .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Unable to load communication history"); return payload })
      .then(payload => { if (active) setEvents(payload.events || []) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load communication history") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accountId])

  const channels = useMemo(() => {
    const counts = new Map<string, number>()
    events.forEach(event => counts.set(event.channel, (counts.get(event.channel) || 0) + 1))
    return [...counts.entries()].sort((left, right) => right[1] - left[1])
  }, [events])
  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return events.filter(event => {
      if (channel !== "ALL" && event.channel !== channel) return false
      if (!needle) return true
      const contact = [event.contact?.firstName, event.contact?.lastName].filter(Boolean).join(" ")
      return [event.channel, event.direction, event.eventType, event.subject, event.summary, event.actor?.name, contact]
        .some(value => String(value || "").toLowerCase().includes(needle))
    })
  }, [channel, events, query])

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-neutral-500">Loading the account communication timeline…</div>
  if (error) return <div className="m-5 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
  return <div className="h-full overflow-y-auto p-5"><div className="mx-auto max-w-6xl space-y-3">
    <div className="mb-4"><h2 className="text-lg font-black">Unified communication history</h2><p className="text-xs text-neutral-500">Existing and newly indexed calls, messages, email activity, and account notes in one chronological view.</p></div>
    {events.length > 0 && <div className="sticky top-0 z-10 mb-4 space-y-3 rounded-2xl border border-white/10 bg-[#0b0e13]/95 p-3 backdrop-blur-xl">
      <div className="relative"><FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search communication history…" className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-cyan-500" /></div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setChannel("ALL")} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold ${channel === "ALL" ? "bg-cyan-600 text-white" : "bg-white/5 text-neutral-400"}`}>All · {events.length}</button>
        {channels.map(([name, count]) => <button key={name} onClick={() => setChannel(name)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold ${channel === name ? "bg-cyan-600 text-white" : "bg-white/5 text-neutral-400"}`}>{name} · {count}</button>)}
      </div>
    </div>}
    {events.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-neutral-500">No communication history is stored for this account yet.</div> : filteredEvents.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-neutral-500">No communication matches this search and channel filter.</div> : filteredEvents.map(event => {
      const contact = [event.contact?.firstName, event.contact?.lastName].filter(Boolean).join(" ")
      return <article key={event.id} className="grid gap-3 rounded-xl border border-white/10 bg-white/[.035] p-4 md:grid-cols-[150px_1fr_180px]">
        <div><div className="text-[10px] font-black uppercase tracking-wider text-cyan-400">{event.channel}</div><div className="mt-1 text-xs text-neutral-500">{event.direction || event.eventType}</div></div>
        <div><div className="text-sm font-bold text-white">{event.subject || event.eventType.replaceAll("_", " ")}</div><div className="mt-1 text-sm text-neutral-400">{event.summary || "No summary recorded."}</div>{(contact || event.actor?.name) && <div className="mt-2 text-[10px] text-neutral-600">{contact ? `Contact: ${contact}` : ""}{contact && event.actor?.name ? " • " : ""}{event.actor?.name ? `Rep: ${event.actor.name}` : ""}</div>}</div>
        <time className="flex items-start gap-2 text-xs text-neutral-500 md:justify-end"><FiClock className="mt-0.5" />{new Date(event.occurredAt).toLocaleString()}</time>
      </article>
    })}
  </div></div>
}

function addressLines(account: any) {
  const source = account?.booksContact?.billing_address || {}
  return [
    account?.billingStreet || source.address,
    [account?.billingCity || source.city, account?.billingState || source.state, account?.billingZip || source.zip].filter(Boolean).join(", "),
    account?.billingCountry || source.country,
  ].filter(Boolean)
}

const money = (value: unknown) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0)

function displayDate(value: unknown) {
  if (!value) return "—"
  const text = String(value)
  const calendar = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  const date = calendar ? new Date(Number(calendar[1]), Number(calendar[2]) - 1, Number(calendar[3])) : new Date(text)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString()
}

function Account360({ account, onCommunicate }: { account: any; onCommunicate: (contactId: string) => void }) {
  const invoices = account?.invoices || []
  const salesOrders = account?.salesOrders || []
  const quotes = account?.quotes || []
  const tasks = account?.tasks || []
  const contacts = account?.contacts || []
  const invoiceRevenue = invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.amount || invoice.total || 0), 0)
  const outstanding = invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.balance || invoice.balanceDue || 0), 0)
  const openOrders = salesOrders.filter((order: any) => !["closed", "void", "cancelled", "invoiced"].includes(String(order.status || "").toLowerCase()))
  const activeTasks = tasks.filter((task: any) => !["completed", "closed", "cancelled"].includes(String(task.status || "").toLowerCase()))
  const recentDocuments = [
    ...invoices.slice(0, 8).map((document: any) => ({ type: "Invoice", number: document.invoiceNumber || document.number || "—", date: document.issueDate, status: document.status, amount: document.amount || document.total })),
    ...salesOrders.slice(0, 8).map((document: any) => ({ type: "Sales Order", number: document.salesOrderNumber || document.number || "—", date: document.orderDate, status: document.status, amount: document.total || document.amount })),
    ...quotes.slice(0, 5).map((document: any) => ({ type: "Quote", number: document.quoteNumber || document.estimateNumber || document.number || "—", date: document.issueDate || document.createdAt, status: document.status, amount: document.total || document.amount })),
  ].sort((left, right) => new Date(String(right.date || 0)).getTime() - new Date(String(left.date || 0)).getTime()).slice(0, 14)

  const metrics = [
    { label: "Invoiced revenue", value: money(invoiceRevenue), detail: `${invoices.length} invoices`, icon: <FiDollarSign /> },
    { label: "Outstanding", value: money(outstanding), detail: "Stored invoice balances", icon: <FiFileText /> },
    { label: "Open sales orders", value: String(openOrders.length), detail: `${salesOrders.length} total orders`, icon: <FiBriefcase /> },
    { label: "Active follow-ups", value: String(activeTasks.length), detail: `${tasks.length} total tasks`, icon: <FiClock /> },
  ]

  return <div className="h-full overflow-y-auto p-5"><div className="mx-auto max-w-7xl space-y-5">
    <div><h2 className="text-lg font-black">Account 360</h2><p className="text-xs text-neutral-500">Local sales, relationship, and follow-up data for the account selected on screen 1.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-400">{metric.icon}{metric.label}</div><div className="mt-3 text-2xl font-black">{metric.value}</div><div className="mt-1 text-xs text-neutral-500">{metric.detail}</div></div>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.45fr_.8fr]">
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.04]"><div className="border-b border-white/10 px-4 py-3 text-sm font-black">Recent sales documents</div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-black/30 text-[10px] uppercase tracking-wider text-neutral-500"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Number</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-white/5">{recentDocuments.length ? recentDocuments.map((document, index) => <tr key={`${document.type}-${document.number}-${index}`}><td className="px-4 py-3 font-bold text-cyan-300">{document.type}</td><td className="px-4 py-3 font-mono text-white">{document.number}</td><td className="px-4 py-3 text-neutral-400">{displayDate(document.date)}</td><td className="px-4 py-3 text-neutral-300">{document.status || "—"}</td><td className="px-4 py-3 text-right font-mono text-white">{money(document.amount)}</td></tr>) : <tr><td colSpan={5} className="px-4 py-10 text-center text-neutral-500">No sales documents are stored for this account.</td></tr>}</tbody></table></div></section>
      <div className="space-y-5">
        <section className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="flex items-center gap-2 text-sm font-black"><FiUsers className="text-cyan-400" />Contacts · {contacts.length}</div><div className="mt-3 space-y-3">{contacts.length ? contacts.map((contact: any) => <div key={contact.id} className="rounded-xl bg-black/25 p-3"><div className="text-sm font-bold">{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed contact"}{contact.isPrimary ? <span className="ml-2 text-[9px] uppercase text-emerald-400">Primary</span> : null}</div><div className="mt-1 text-xs text-neutral-400">{contact.title || contact.role || ""}</div><div className="mt-1 text-xs text-neutral-500">{contact.phone || contact.mobilePhone || "No phone"}</div><div className="text-xs text-neutral-500">{contact.email || "No email"}</div><button onClick={() => onCommunicate(contact.id)} className="mt-3 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-500">Communicate with this contact</button></div>) : <div className="py-6 text-center text-xs text-neutral-500">No contacts stored.</div>}</div></section>
        <section className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="flex items-center gap-2 text-sm font-black"><FiClock className="text-orange-400" />Next actions</div><div className="mt-3 space-y-2">{activeTasks.length ? activeTasks.slice(0, 8).map((task: any) => <div key={task.id} className="rounded-xl bg-black/25 p-3"><div className="text-sm font-bold">{task.subject}</div><div className="mt-1 text-xs text-neutral-500">{task.status || "Open"} · Due {displayDate(task.dueDate)}</div></div>) : <div className="py-6 text-center text-xs text-neutral-500">No active follow-ups.</div>}</div></section>
      </div>
    </div>
  </div></div>
}

export function AccountSecondScreenWorkspace({ accountId, account }: { accountId: string; account: any }) {
  const searchParams = useSearchParams()
  const devBypass = process.env.NODE_ENV === "development" && searchParams.get("bypass") === "true" ? "&bypass=true" : ""
  const [tab, setTab] = useState<WorkspaceTab>("communications")
  const primary = account?.contacts?.find((contact: any) => contact.isPrimary) || account?.contacts?.[0]
  const [selectedContactId, setSelectedContactId] = useState(primary?.id || "")
  const selectedContact = account?.contacts?.find((contact: any) => contact.id === selectedContactId) || primary
  const recipient = `${selectedContact?.firstName || ""} ${selectedContact?.lastName || ""}`.trim() || account?.name || "Customer"
  const address = useMemo(() => addressLines(account), [account])
  const [subject, setSubject] = useState("A message from Titan Diamond USA")
  const [letter, setLetter] = useState("")

  useEffect(() => {
    const loadPostalCampaign = (event: Event) => {
      const detail = (event as CustomEvent<{ subject?: string; body?: string }>).detail
      if (!detail?.body) return
      setSubject(detail.subject || "A message from Titan Diamond USA")
      setLetter(detail.body)
      setTab("postal")
    }
    window.addEventListener("titan:postal-campaign", loadPostalCampaign)
    return () => window.removeEventListener("titan:postal-campaign", loadPostalCampaign)
  }, [])

  const printLetter = () => {
    const popup = window.open("", "titan-postal-letter", "popup=yes,width=900,height=1000,resizable=yes")
    if (!popup) return
    const safe = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] || character))
    popup.document.write(`<!doctype html><html><head><title>${safe(subject)}</title><style>body{font:16px/1.55 Arial,sans-serif;color:#111;max-width:760px;margin:60px auto;padding:0 35px}header{border-bottom:3px solid #f97316;padding-bottom:18px;margin-bottom:42px}h1{margin:0;font-size:22px}address{font-style:normal;margin-bottom:36px}.body{white-space:pre-wrap}.footer{margin-top:60px;color:#555}</style></head><body><header><h1>TITAN DIAMOND USA</h1><div>(480) 470-2577</div></header><address>${safe(recipient)}<br>${address.map((line: string) => safe(line)).join("<br>")}</address><h2>${safe(subject)}</h2><div class="body">${safe(letter)}</div><div class="footer">Titan Diamond USA</div><script>window.onload=()=>window.print()</script></body></html>`)
    popup.document.close()
  }

  const tabs: Array<{ id: WorkspaceTab; label: string; icon: React.ReactNode }> = [
    { id: "communications", label: "Communications & Sales", icon: <FiSend /> },
    { id: "account", label: "Account 360", icon: <FiBriefcase /> },
    { id: "timeline", label: "Unified History", icon: <FiClock /> },
    { id: "campaigns", label: "Campaign Builder", icon: <FiTarget /> },
    { id: "creative", label: "Flyer Studio", icon: <FiImage /> },
    { id: "postal", label: "Postal Letter", icon: <FiMail /> },
  ]

  return <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#07090d] text-white">
    <header className="flex-none border-b border-white/10 bg-black/70 px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-400">Account communications workspace</div>
          <h1 className="truncate text-xl font-black uppercase">{account?.name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
            <span>{recipient}</span><span>{selectedContact?.phone || selectedContact?.mobilePhone || account?.booksContact?.phone || "No phone"}</span><span>{selectedContact?.email || account?.booksContact?.email || "No email"}</span>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">Paired to the account open on screen 1</div>
      </div>
      <nav className="mt-3 flex gap-1 overflow-x-auto">
        {tabs.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${tab === item.id ? "bg-cyan-600 text-white" : "bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white"}`}>{item.icon}{item.label}</button>)}
      </nav>
    </header>

    <main className="min-h-0 flex-1 overflow-hidden">
      {tab === "communications" && <div className="h-full overflow-y-auto p-4"><CommunicationCenter accountId={account?.id || accountId} account={account} contacts={account?.contacts || []} selectedContactId={selectedContactId} onContactChange={setSelectedContactId} /></div>}
      {tab === "account" && <Account360 account={account} onCommunicate={contactId => { setSelectedContactId(contactId); setTab("communications") }} />}
      {tab === "timeline" && <CommunicationTimeline accountId={account?.id || accountId} />}
      {tab === "campaigns" && <div className="h-full"><iframe title="Campaign Builder" src={`/admin/campaigns?display=1&accountId=${encodeURIComponent(accountId)}&accountName=${encodeURIComponent(account?.name || "")}${devBypass}`} className="h-full w-full border-0" /></div>}
      {tab === "creative" && <div className="h-full"><iframe title="Flyer Studio" src={`/admin/flyer-studio?display=1&accountId=${encodeURIComponent(accountId)}&accountName=${encodeURIComponent(account?.name || "")}${devBypass}`} className="h-full w-full border-0" /></div>}
      {tab === "postal" && <div className="h-full overflow-y-auto p-5">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
            <div className="flex items-center gap-2 text-sm font-black"><FiMapPin className="text-orange-400" />Mailing destination</div>
            <div className="mt-4 text-sm font-bold">{recipient}</div>
            <div className="mt-1 text-sm leading-6 text-neutral-400">{address.length ? address.map((line: string) => <div key={line}>{line}</div>) : "No billing address is on file."}</div>
            <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">This creates a print-ready postal letter. Physical mailing and postage still require a configured mail vendor or manual fulfillment.</div>
          </aside>
          <section className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
            <div className="flex items-center gap-2 text-sm font-black"><FiEdit3 className="text-cyan-400" />Compose postal message</div>
            <label className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-neutral-500">Subject</label>
            <input value={subject} onChange={event => setSubject(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-cyan-500" />
            <label className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-neutral-500">Letter</label>
            <textarea value={letter} onChange={event => setLetter(event.target.value)} rows={16} placeholder={`Dear ${recipient},\n\nWrite your message here...`} className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 outline-none focus:border-cyan-500" />
            <div className="mt-4 flex justify-end"><button onClick={printLetter} disabled={!letter.trim() || !address.length} className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white disabled:opacity-40"><FiPrinter />Print mailing letter</button></div>
          </section>
        </div>
      </div>}
    </main>
  </div>
}
