"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { FiAlertTriangle, FiCheck, FiInbox, FiLink, FiRefreshCw, FiShield, FiX } from "react-icons/fi"
import toast from "react-hot-toast"

type EventItem = {
  id: string
  eventType: string
  status: string
  confidence: number
  summary: string
  conflictReason?: string | null
  matchMethod?: string | null
  matchConfidence?: number | null
  extractedData: Record<string, unknown>
  createdAt: string
  updatedAt: string
  accountId?: string | null
  appliedChanges?: { taskId?: string } | null
  email: { subject: string; fromAddress: string; receivedAt?: string | null; sentAt?: string | null; direction: string; mailboxAddress?: string | null; body?: string | null; attachments?: Array<{ id: string; name: string; classification?: string | null }> }
}

type PageData = {
  configuration: { configured: boolean; mailboxAddress?: string | null; missing: string[] }
  requiredDetails: Array<{ key: string; label: string; detail: string; source: string; sourceUrl?: string; required: boolean }>
  counts: Array<{ status: string; _count: { _all: number } }>
  events: EventItem[]
  users: Array<{ id: string; name?: string | null; email: string; role: string }>
  mailboxes: Array<{ id: string; address: string; displayName?: string | null; mailboxType: string; enabled: boolean; includeInbox: boolean; includeSent: boolean; autoSync: boolean; lookbackDays: number; lastSyncAt?: string | null; lastSyncStatus?: string | null; lastSyncError?: string | null; userId?: string | null; user?: { id: string; name?: string | null; email: string } | null }>
}

const eventLabel = (value: string) => value.replaceAll("_", " ")

export default function EmailIntelligencePage() {
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [reviewBusy, setReviewBusy] = useState<string | null>(null)
  const [editingMailbox, setEditingMailbox] = useState<string | null>(null)
  const [correctedAddress, setCorrectedAddress] = useState("")
  const [followUpOwners, setFollowUpOwners] = useState<Record<string, string>>({})
  const [followUpDates, setFollowUpDates] = useState<Record<string, string>>({})
  const [status, setStatus] = useState("REVIEW_REQUIRED")
  const [mailboxAddress, setMailboxAddress] = useState("")
  const [mailboxUserId, setMailboxUserId] = useState("")
  const [mailboxType, setMailboxType] = useState("USER")

  const fetchData = useCallback(async () => {
    const response = await fetch(`/api/admin/email-intelligence?status=${encodeURIComponent(status)}`, { cache: "no-store" })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || "Unable to load email intelligence.")
    return payload as PageData
  }, [status])

  const load = useCallback(async () => {
    try { setData(await fetchData()) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load email intelligence.") }
    finally { setLoading(false) }
  }, [fetchData])

  useEffect(() => {
    let active = true
    void fetchData()
      .then(payload => { if (active) setData(payload) })
      .catch(error => { if (active) toast.error(error instanceof Error ? error.message : "Unable to load email intelligence.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fetchData])

  const countMap = useMemo(() => Object.fromEntries((data?.counts || []).map(item => [item.status, item._count._all])), [data])

  const sync = async () => {
    setSyncing(true)
    try {
      const response = await fetch("/api/admin/email-intelligence/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lookbackDays: 90, maxPerFolder: 50 }) })
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || payload.results?.flatMap((r: { errors: string[] }) => r.errors).join("; ") || "Sync failed.")
      toast.success(`Processed ${payload.processed} messages and added ${payload.createdEvents} new review events. Sync continues automatically.`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed.")
    } finally {
      setSyncing(false)
    }
  }

  const updateMailbox = async (id: string, changes: Record<string, unknown>) => {
    try {
      const response = await fetch("/api/admin/email-intelligence", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Mailbox update failed.")
      await load()
      return true
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Mailbox update failed.'); return false }
  }

  const assignMailbox = async () => {
    const response = await fetch("/api/admin/email-intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: mailboxAddress, userId: mailboxUserId || null, mailboxType, lookbackDays: 90 }) })
    const payload = await response.json()
    if (!response.ok) return toast.error(payload.error || "Mailbox assignment failed.")
    setMailboxAddress("")
    setMailboxUserId("")
    toast.success("Mailbox assigned.")
    await load()
  }

  const syncMailbox = async (mailboxId: string) => {
    setSyncing(true)
    try {
      const response = await fetch("/api/admin/email-intelligence/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mailboxId, maxPerFolder: 50 }) })
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || payload.results?.flatMap((r: { errors: string[] }) => r.errors).join("; ") || "Mailbox sync failed.")
      toast.success(`Processed ${payload.processed} messages.`)
      await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Mailbox sync failed.") }
    finally { setSyncing(false) }
  }

  const review = async (id: string, action: "APPROVE" | "REJECT" | "REOPEN" | "CREATE_TASK" | "LINK_ACCOUNT", accountId?: string) => {
    if (reviewBusy) return
    setReviewBusy(id)
    try {
    const response = await fetch("/api/admin/email-intelligence", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, accountId, ownerId: followUpOwners[id] || undefined, dueDate: followUpDates[id] ? new Date(followUpDates[id]).toISOString() : undefined, expectedUpdatedAt: data?.events.find(event => event.id === id)?.updatedAt }) })
    const payload = await response.json()
    if (!response.ok) return toast.error(payload.error || "Review update failed.")
    toast.success(action === "LINK_ACCOUNT" ? "Account linked. Review the evidence before approving." : action === "CREATE_TASK" ? "Assigned follow-up created. View it in Tasks." : action === "APPROVE" ? "Evidence approved. You can now create an assigned follow-up." : "Review status updated.")
    await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Review failed.") }
    finally { setReviewBusy(null) }
  }

  return <div className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.22em] text-cyan-400"><FiInbox /> Microsoft 365 operations intake</div>
        <h1 className="mt-1 text-2xl font-black text-white md:text-3xl">Email Intelligence</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-400">Review customer requests and operational email evidence in one place. Review the source, confirm its account, and turn approved findings into assigned follow-up tasks.</p>
      </div>
      <button onClick={() => void sync()} disabled={syncing || !data?.configuration.configured} className="td-btn td-btn-primary disabled:cursor-not-allowed disabled:opacity-40">
        <FiRefreshCw className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync next batch"}
      </button>
    </header>

    <section className={`rounded-2xl border p-5 ${data?.configuration.configured ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/25 bg-amber-500/5"}`}>
      <div className="flex items-start gap-3">
        {data?.configuration.configured ? <FiCheck className="mt-0.5 text-emerald-400" /> : <FiAlertTriangle className="mt-0.5 text-amber-400" />}
        <div>
          <h2 className="font-black text-white">{data?.configuration.configured ? "Microsoft mailbox connection is configured" : "Connection details are still required"}</h2>
          <p className="mt-1 text-sm text-neutral-400">{data?.configuration.configured ? "Ready to sync enabled, assigned mailboxes. History resumes in small batches every three minutes." : `Missing server settings: ${data?.configuration.missing.join(", ") || "loading…"}`}</p>
          <p className="mt-2 flex items-center gap-2 text-xs text-neutral-500"><FiShield /> Email is read-only. Reviewed follow-ups appear in Tasks; payments, shipping and customer replies use their existing approval workflows.</p>
        </div>
      </div>
    </section>

    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-black uppercase tracking-wider text-neutral-500">Mailbox oversight</h2>
        <p className="mt-1 text-sm text-neutral-500">Reps opt into individual mailbox access from their own profile. Administrators can monitor, pause, or sync configured mailboxes here.</p>
      </div>
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-4 xl:grid-cols-[1.3fr_1fr_.7fr_auto]">
        <input value={mailboxAddress} onChange={event => setMailboxAddress(event.target.value)} placeholder="Additional or shared mailbox" className="td-input min-w-0" />
        <select value={mailboxUserId} onChange={event => setMailboxUserId(event.target.value)} className="td-input min-w-0">
          <option value="">Unassigned/shared</option>
          {(data?.users || []).map(user => <option key={user.id} value={user.id}>{user.name || user.email} · {user.email}</option>)}
        </select>
        <select value={mailboxType} onChange={event => setMailboxType(event.target.value)} className="td-input min-w-0"><option value="USER">Additional user mailbox</option><option value="SHARED">Shared mailbox</option></select>
        <button onClick={() => void assignMailbox()} disabled={!mailboxAddress} className="td-btn td-btn-primary disabled:opacity-40">Assign mailbox</button>
      </div>
      {!data?.mailboxes.length && <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-neutral-500">No reps have enabled the email add-on yet.</div>}
      {(data?.mailboxes || []).map(mailbox => <article key={mailbox.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-white">{mailbox.displayName || mailbox.user?.name || mailbox.address}</h3><span className="rounded-full bg-neutral-800 px-2 py-1 text-[10px] font-black uppercase text-neutral-400">{mailbox.mailboxType}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${mailbox.enabled ? "bg-emerald-500/10 text-emerald-300" : "bg-neutral-800 text-neutral-500"}`}>{mailbox.enabled ? "Enabled" : "Disabled"}</span></div>
            <p className="mt-1 text-sm text-neutral-400">{mailbox.address}{mailbox.user ? ` · assigned to ${mailbox.user.name || mailbox.user.email}` : " · not assigned to a portal user"}</p>
            <p className="mt-1 text-xs text-neutral-600">Inbox {mailbox.includeInbox ? "on" : "off"} · Sent {mailbox.includeSent ? "on" : "off"} · {mailbox.lookbackDays}-day history · {mailbox.lastSyncAt ? `last sync ${new Date(mailbox.lastSyncAt).toLocaleString()} (${mailbox.lastSyncStatus || "unknown"})` : "not synced yet"}</p>
            {mailbox.lastSyncError && <p className="mt-1 text-xs text-red-300">{mailbox.lastSyncError}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setEditingMailbox(mailbox.id); setCorrectedAddress(mailbox.address) }} className="td-btn td-btn-ghost td-btn-sm">Correct address</button>
            <button onClick={() => void updateMailbox(mailbox.id, { autoSync: !mailbox.autoSync })} className="td-btn td-btn-ghost td-btn-sm">Auto-sync: {mailbox.autoSync ? "On" : "Off"}</button>
            <button onClick={() => void updateMailbox(mailbox.id, { enabled: !mailbox.enabled })} className="td-btn td-btn-ghost td-btn-sm">{mailbox.enabled ? "Disable" : "Enable"}</button>
            <button onClick={() => void syncMailbox(mailbox.id)} disabled={syncing || !mailbox.enabled || !data?.configuration.configured} className="td-btn td-btn-primary td-btn-sm disabled:opacity-40"><FiRefreshCw className={syncing ? "animate-spin" : ""} /> Sync</button>
          </div>
        </div>
        {editingMailbox === mailbox.id && <div className="mt-3 flex flex-wrap gap-2"><input aria-label="Correct mailbox address" value={correctedAddress} onChange={event => setCorrectedAddress(event.target.value)} className="td-input min-w-0" /><button className="td-btn td-btn-primary" onClick={async () => { if (await updateMailbox(mailbox.id, { address: correctedAddress })) setEditingMailbox(null) }}>Save address</button><button className="td-btn td-btn-ghost" onClick={() => setEditingMailbox(null)}>Cancel</button></div>}
      </article>)}
    </section>

    <details>
      <summary className="mb-3 cursor-pointer text-xs font-black uppercase tracking-wider text-neutral-500">Connection setup and operating guidance</summary>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(data?.requiredDetails || []).map(item => <article key={item.key} className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
          <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-white">{item.label}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${item.required ? "bg-red-500/10 text-red-300" : "bg-neutral-800 text-neutral-400"}`}>{item.required ? "Required" : "Helpful"}</span></div>
          <p className="mt-2 text-sm leading-relaxed text-neutral-500">{item.detail}</p>
          <p className="mt-3 text-xs leading-relaxed text-neutral-300"><span className="font-black uppercase tracking-wide text-cyan-400">Where to get it:</span> {item.source}</p>
          {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-cyan-300 hover:text-cyan-200"><FiLink /> Open source</a>}
        </article>)}
      </div>
    </details>

    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xs font-black uppercase tracking-wider text-neutral-500">Operational review queue</h2>
        <div className="flex flex-wrap gap-2">
          {["REVIEW_REQUIRED", "APPROVED", "APPLIED", "REJECTED", "ALL"].map(item => <button key={item} onClick={() => { setLoading(true); setStatus(item) }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${status === item ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-white/10 text-neutral-500 hover:text-white"}`}>{item === "APPLIED" ? "FOLLOW-UP CREATED" : eventLabel(item)}{countMap[item] !== undefined ? ` (${countMap[item]})` : ""}</button>)}
        </div>
      </div>

      {loading ? <div className="rounded-2xl border border-white/10 p-8 text-center text-sm text-neutral-500">Loading review queue…</div> : !data?.events.length ? <div className="rounded-2xl border border-white/10 p-8 text-center text-sm text-neutral-500">No events match this view.</div> : data.events.map(event => <article key={event.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-300">{eventLabel(event.eventType)}</span><span className="text-xs text-neutral-500">{Math.round(event.confidence * 100)}% extraction confidence</span></div>
            <h3 className="mt-3 font-black text-white">{event.summary}</h3>
            <p className="mt-1 truncate text-sm text-neutral-500">{event.email.fromAddress} · {event.email.subject}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-400">
              <span className="flex items-center gap-1"><FiLink /> {event.matchMethod ? `${eventLabel(event.matchMethod)} match` : "Unmatched"}</span>
              {event.matchConfidence !== null && event.matchConfidence !== undefined && <span>{Math.round(event.matchConfidence * 100)}% match confidence</span>}
              {event.conflictReason && <span className="text-amber-300">{event.conflictReason}</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {event.status === "REVIEW_REQUIRED" ? <><button disabled={!!reviewBusy} onClick={() => void review(event.id, "REJECT")} className="td-btn td-btn-ghost td-btn-sm"><FiX /> Reject</button><button disabled={!!reviewBusy} onClick={() => void review(event.id, "APPROVE")} className="td-btn td-btn-primary td-btn-sm"><FiCheck /> Approve</button></> : event.status === 'APPLIED' ? <a href="/tasks" className="td-btn td-btn-ghost td-btn-sm">View follow-ups</a> : <><button disabled={!!reviewBusy} onClick={() => void review(event.id, "REOPEN")} className="td-btn td-btn-ghost td-btn-sm">Reopen</button>{event.status === 'APPROVED' && <button disabled={!!reviewBusy || !event.accountId || !!event.conflictReason} onClick={() => void review(event.id, 'CREATE_TASK')} className="td-btn td-btn-primary td-btn-sm disabled:opacity-40">Create assigned follow-up</button>}</>}
          </div>
        </div>
        {event.status === 'APPROVED' && <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-neutral-400">Follow-up owner<select aria-label="Follow-up owner" className="td-input mt-1 block" value={followUpOwners[event.id] || ''} onChange={e => setFollowUpOwners(v => ({ ...v, [event.id]: e.target.value }))}><option value="">Account owner</option>{data.users.map(user => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</select></label>
          <label className="text-xs text-neutral-400">Due date (default: tomorrow)<input aria-label="Follow-up due date" type="datetime-local" className="td-input mt-1 block" value={followUpDates[event.id] || ''} onChange={e => setFollowUpDates(v => ({ ...v, [event.id]: e.target.value }))} /></label>
        </div>}
        <details className="mt-4 border-t border-white/10 pt-3"><summary className="cursor-pointer text-sm text-cyan-300">Review source and extracted evidence</summary>
          {event.status !== 'APPLIED' && <EmailAccountLink busy={!!reviewBusy} onLink={accountId => review(event.id, 'LINK_ACCOUNT', accountId)} />}
          {event.accountId && <a href={`/account?id=${encodeURIComponent(event.accountId)}`} className="mt-3 inline-block text-cyan-300">Open matched account</a>}
          <p className="mt-3 text-xs text-neutral-400">{event.email.mailboxAddress} · {event.email.direction} · {event.email.receivedAt || event.email.sentAt || event.createdAt}</p>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 text-xs">{event.email.body || 'No message body available.'}</pre>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-neutral-300">{JSON.stringify(event.extractedData, null, 2)}</pre>
          {event.email.attachments?.map(file => <p key={file.id} className="mt-2 text-xs text-neutral-400">Attachment: {file.name} · {file.classification || 'Not classified'} (metadata only)</p>)}
        </details>
      </article>)}
    </section>
  </div>
}

function EmailAccountLink({ busy, onLink }: { busy: boolean; onLink: (accountId: string) => Promise<unknown> }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; name: string }>>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setResults([]); setSelected(''); setError('')
    if (query.trim().length < 2) return () => controller.abort()
    const timer = setTimeout(() => {
      void fetch(`/api/admin/email-intelligence?accountSearch=${encodeURIComponent(query)}`, { signal: controller.signal, cache: 'no-store' })
        .then(async response => { if (!response.ok) throw new Error('Account search failed.'); return response.json() })
        .then(payload => { if (!controller.signal.aborted) { setResults(payload.accounts); if (!payload.accounts.length) setError('No matching accounts.') } })
        .catch(() => { if (!controller.signal.aborted) setError('Account search failed. Try again.') })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])
  return <div className="mt-3 space-y-2 rounded-lg border border-white/10 p-3">
    <p className="text-xs text-neutral-400">Link or correct the account. This clears automatic document links and requires a fresh review.</p>
    <div className="flex flex-wrap gap-2">
      <input aria-label="Search account to link" placeholder="Search account name" value={query} onChange={e => setQuery(e.target.value)} className="td-input min-w-0" />
      <select aria-label="Account to link" value={selected} onChange={e => setSelected(e.target.value)} className="td-input min-w-0 max-w-full"><option value="">Choose account</option>{results.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
      <button disabled={busy || !selected} onClick={() => void onLink(selected)} className="td-btn td-btn-ghost disabled:opacity-40">Link account for review</button>
    </div>
    {error && <p className="text-xs text-amber-300">{error}</p>}
  </div>
}
