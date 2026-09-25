'use client'
import { useEffect, useState } from 'react'
const dispositions = ['Needs Review','Written Off','Voided','Draft Invoice','Credited / Refunded','Settled — Review Payment','Overdue','Partially Paid','Invoiced','Paid','Complete']
export default function DealSyncAdmin() {
  const [data, setData] = useState<any>(null)
  const [config, setConfig] = useState<any>({ enabled: false, identityField: 'Portal_Deal_ID', portalUrl: 'https://titan-sales-portal.netlify.app', stages: {} })
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  async function load() {
    try { const response = await fetch('/api/admin/deal-sync?metadata=1'); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to load sync status'); setData(result); if (result.config) setConfig(result.config) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load sync status') }
  }
  useEffect(() => { void load() }, [])
  async function act(action: string) {
    setBusy(true); setMessage('')
    try { const response = await fetch('/api/admin/deal-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, config }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setMessage(action === 'run' ? `Processed ${result.results.length} invoices; ${result.results.filter((r: any) => r.status !== 'SYNCED').length} require review.` : 'Configuration saved.'); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Sync failed') } finally { setBusy(false) }
  }
  const stages = data?.fields?.find((f: any) => f.api_name === 'Stage')?.pick_list_values || []
  return <main className="mx-auto max-w-4xl space-y-6 p-6 text-neutral-100"><h1 className="text-3xl font-bold">Invoice ↔ CRM deal reconciliation</h1>
    <p className="text-neutral-400">Link every invoice to a deal, publish its complete package, and keep invoice-driven stages current. Existing CRM notes and custom fields are preserved.</p>
    {message && <p role="status" className="rounded-lg border border-amber-400/30 p-4">{message}</p>}
    {data && <p>{data.invoiceCount} invoices · {data.missingLinks} missing deal links · {data.exceptions.length} displayed exceptions</p>}
    {data && <p className="text-sm text-neutral-400">{data.missingCrmMappings} invoices need a verified CRM Account mapping. {data.coverage?.[0]?.pending ?? 0} invoices are awaiting synchronization.</p>}
    {data?.metadataError && <p className="rounded border border-amber-400/30 p-4 text-amber-300">CRM configuration could not be verified: {data.metadataError}. Zoho must authorize field-settings reads before synchronization can be enabled.</p>}
    <div className="space-y-4 rounded-xl border border-white/10 p-5"><label className="block">Unique CRM identity field<input className="mt-1 block w-full rounded bg-neutral-900 p-2" value={config.identityField} onChange={e => setConfig({ ...config, identityField: e.target.value })} /></label><p className="text-sm text-neutral-400">Select an existing unique text field on Zoho Deals. All dispositions must map to valid CRM stages before enabling writes.</p>
    <label className="block">CRM pipeline (if enabled in Zoho)<input className="mt-1 block w-full rounded bg-neutral-900 p-2" value={config.pipeline || ''} onChange={e => setConfig({ ...config, pipeline: e.target.value })} /></label>
    {dispositions.map(stage => <label key={stage} className="grid gap-2 sm:grid-cols-2">{stage}<select className="rounded bg-neutral-900 p-2" value={config.stages[stage] || ''} onChange={e => setConfig({ ...config, stages: { ...config.stages, [stage]: e.target.value } })}><option value="">Choose CRM stage</option>{stages.map((s: any) => <option key={s.actual_value} value={s.actual_value}>{s.display_value}</option>)}</select></label>)}
    <label className="flex gap-3"><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />Enable scheduled CRM writes and historical reconciliation</label>
    <div className="flex gap-3"><button disabled={busy || !data} onClick={() => act('configure')} className="rounded bg-emerald-700 px-4 py-2 disabled:opacity-40">Save configuration</button><button disabled={busy || !data?.config?.enabled} onClick={() => act('run')} className="rounded bg-neutral-700 px-4 py-2 disabled:opacity-40">Run next batch</button></div></div>
    <h2 className="text-xl font-semibold">Reconciliation exceptions</h2><div className="space-y-2">{data?.exceptions?.map((row: any) => <div className="rounded border border-white/10 p-3 text-sm" key={row.invoiceId}><p>{row.invoiceId}</p><p className="text-amber-300">{row.lastError}</p></div>)}</div>
  </main>
}
