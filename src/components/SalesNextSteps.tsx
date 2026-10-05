"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { salesNextSteps, salesStepPrompt, type SalesAccount } from '@/lib/sales-next-steps'

export function SalesNextSteps({ account: supplied, accountId, active = true }: { account?: SalesAccount; accountId?: string; active?: boolean }) {
  const [loaded, setLoaded] = useState<{ requestedId: string; account: SalesAccount } | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)
  useEffect(() => {
    if (supplied || !accountId || !active) return
    const controller = new AbortController()
    setLoading(true); setError('')
    fetch(`/api/get-account-details?id=${encodeURIComponent(accountId)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { const data = await response.json(); if (!response.ok || !data.account) throw new Error(data.error || 'Unable to load next steps'); return data.account })
      .then(data => { if (!controller.signal.aborted) setLoaded({ requestedId: accountId, account: data }) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [supplied, accountId, active, revision])
  const account = supplied || (loaded && loaded.requestedId === accountId ? loaded.account : null)
  const ask = (prompt: string) => window.dispatchEvent(new CustomEvent('openTitanAi', { detail: { prompt } }))
  if (!supplied && !accountId) return <p className="p-4 text-sm text-neutral-400">Open an account, or choose a messaging account, to see its sales next steps.</p>
  if (loading) return <p role="status" className="p-4 text-sm">Reviewing account workflow…</p>
  if (error) return <div role="alert" className="p-4 text-sm text-amber-300">{error}<button className="ml-3 underline" onClick={() => setRevision(value => value + 1)}>Retry</button></div>
  if (!account) return null
  const steps = salesNextSteps(account)
  return <section aria-label="Sales next steps" className="min-w-0 space-y-3 rounded-2xl border border-cyan-500/25 bg-cyan-950/10 p-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h2 className="text-base font-bold">Move the sale forward</h2><p className="break-words text-xs text-neutral-400">{account.name} · {steps.length} open workflow items</p></div>{!supplied && <button onClick={() => setRevision(value => value + 1)} className="rounded-lg border border-white/15 px-3 py-2 text-xs">Refresh</button>}</div>
    <div className="flex flex-wrap gap-2 text-xs"><button onClick={() => ask(salesStepPrompt(account))} className="rounded-lg bg-cyan-700 px-3 py-2 font-semibold">Plan next steps with AI</button><button onClick={() => ask(salesStepPrompt(account, undefined, true))} className="rounded-lg border border-white/15 px-3 py-2">Help automate follow-up</button><Link href={`/account?id=${encodeURIComponent(account.id)}&tab=quicksale`} className="rounded-lg border border-white/15 px-3 py-2">Quote / order</Link></div>
    <div className="flex flex-wrap gap-3 text-xs text-cyan-200"><Link href={`/account?id=${encodeURIComponent(account.id)}&tab=comms`}>Call / message customer</Link><Link href={`/tasks/new?${new URLSearchParams({ accountId: account.id, accountName: account.name })}`}>Add task</Link></div>
    <p className="text-xs text-neutral-400">Suggestions from saved records. Review with AI, then confirm the owner, date and action.</p>
    {!steps.length && <p className="text-sm text-neutral-300">No open workflow items found. Plan a check-in or a new opportunity.</p>}
    <div className="space-y-2">{(showAll ? steps : steps.slice(0, 5)).map(step => <article key={step.key} className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className={`break-words text-sm font-semibold ${step.urgent ? 'text-amber-200' : 'text-white'}`}>{step.urgent && 'Needs attention · '}{step.title}</p><p className="mt-1 break-words text-xs text-neutral-400">{step.reason}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs"><button onClick={() => ask(salesStepPrompt(account, step))} className="rounded-lg bg-white/10 px-3 py-2">Prepare next action</button>{step.existingTask ? <Link href="/tasks" className="rounded-lg border border-white/15 px-3 py-2">Review tasks</Link> : <Link href={`/tasks/new?${new URLSearchParams({ accountId: account.id, accountName: account.name, subject: step.title, description: `${step.reason}\nSource: ${step.record}\nReview existing account tasks before saving.` })}`} className="rounded-lg border border-white/15 px-3 py-2">Schedule follow-up</Link>}</div>
    </article>)}</div>
    {steps.length > 5 && <button onClick={() => setShowAll(value => !value)} className="rounded-lg border border-white/15 px-3 py-2 text-xs">{showAll ? 'Show fewer' : `Show all ${steps.length} workflow items`}</button>}
  </section>
}
