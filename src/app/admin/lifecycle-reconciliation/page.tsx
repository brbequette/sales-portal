'use client'

import { useState } from 'react'

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({ error: `Non-JSON response (HTTP ${response.status})` }))
  if (!response.ok && response.status !== 202) throw new Error(payload.message || payload.error || JSON.stringify(payload))
  return payload
}

export default function LifecycleReconciliationPage() {
  const [accountId, setAccountId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [sku, setSku] = useState('RFD-50A060')
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<unknown>(null)

  const run = async (kind: 'account' | 'product') => {
    setBusy(kind); setResult(null)
    try {
      setResult(kind === 'account'
        ? await postJson('/api/admin/lifecycle/reconcile-account', { accountId, leadId })
        : await postJson('/api/admin/lifecycle/reconcile-product', { sku }))
    } catch (error) {
      setResult({ success: false, error: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(null) }
  }

  return <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
    <header><div className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">Restricted data repair</div><h1 className="text-3xl font-black text-white">Lifecycle reconciliation</h1><p className="mt-2 max-w-3xl text-sm text-neutral-400">Resolve existing local records by exact identifiers. These actions are idempotent and never create a second local account or Books customer.</p></header>
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 space-y-4">
      <h2 className="font-black text-white">Existing converted account</h2>
      <input aria-label="Local account ID" value={accountId} onChange={event => setAccountId(event.target.value)} placeholder="Local account ID" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3" />
      <input aria-label="Local lead ID" value={leadId} onChange={event => setLeadId(event.target.value)} placeholder="Local lead ID" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3" />
      <button disabled={busy !== null || !accountId || !leadId} onClick={() => run('account')} className="rounded-xl bg-amber-600 px-4 py-2 font-bold text-white disabled:opacity-40">{busy === 'account' ? 'Reconciling…' : 'Reconcile CRM and Books mappings'}</button>
    </section>
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 space-y-4">
      <h2 className="font-black text-white">Exact Books product</h2>
      <input aria-label="Exact SKU" value={sku} onChange={event => setSku(event.target.value)} placeholder="Exact SKU" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3" />
      <p className="text-xs text-neutral-500">A bounded exact-SKU lookup verifies rates, type and preferred vendor. Dropship remains blocked unless Books returns an explicit eligibility flag.</p>
      <button disabled={busy !== null || !sku} onClick={() => run('product')} className="rounded-xl bg-cyan-600 px-4 py-2 font-bold text-white disabled:opacity-40">{busy === 'product' ? 'Reconciling…' : 'Reconcile exact product'}</button>
    </section>
    {result ? <pre className="overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs text-neutral-300">{JSON.stringify(result, null, 2)}</pre> : null}
  </div>
}
