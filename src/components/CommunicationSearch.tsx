"use client"

import { lazy, Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { FiSearch } from 'react-icons/fi'
import { useProductModal } from './ProductModalProvider'
import { publishCommunicationContext, type CommunicationContext } from '@/lib/communication-context'

type RecordResult = { id: string; zohoId?: string; name?: string; accountId?: string; accountName?: string; account?: { name: string }; firstName?: string; lastName?: string; phone?: string; mobilePhone?: string; email?: string; sku?: string; price?: number; invoiceNumber?: string; docType?: 'Invoice' | 'Quote' | 'SalesOrder'; status?: string; stage?: string }
type Results = Partial<Record<'accounts' | 'contacts' | 'invoices' | 'deals' | 'products', RecordResult[]>>
const InvoiceDetailsModal = lazy(() => import('./InvoiceDetailsModal').then(module => ({ default: module.InvoiceDetailsModal })))
export function CommunicationSearch({ active, onMessages, onOpenRecord }: { active: boolean; onMessages: (id: string, name: string, contactId?: string) => void; onOpenRecord: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Results>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [document, setDocument] = useState<RecordResult | null>(null)
  const { showProduct } = useProductModal()
  useEffect(() => {
    if (!active || query.trim().length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/global-search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: 'no-store' })
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error('Search is unavailable. Please try again.')
        if (!controller.signal.aborted) setResults(data.results || {})
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Search unavailable')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [active, query])
  const groups = Object.entries(results) as Array<[keyof Results, RecordResult[]]>
  return <><section className="flex h-full min-h-0 flex-col gap-3 p-3" aria-label="Search communications records">
    <label className="flex shrink-0 items-center gap-2 rounded-xl border border-white/15 p-3"><FiSearch /><input aria-label="Search accounts, contacts, products and orders" placeholder="Account, contact, product, order…" value={query} onChange={e => { setQuery(e.target.value); setResults({}); setError(''); setLoading(false) }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-3">
      {query.trim().length < 2 && <p className="text-sm text-neutral-400">Search by name, phone, email, SKU or document number. Open a record, prepare a call or select a messaging contact without leaving this workspace.</p>}
      {loading && <p role="status">Searching…</p>}
      {error && <p role="alert" className="text-amber-300">{error}</p>}
      {!loading && !error && query.trim().length >= 2 && groups.length > 0 && !groups.some(([, items]) => items.length) && <p>No matching records.</p>}
      {groups.map(([group, items]) => items.length > 0 && <div key={group}><h3 className="mb-2 text-xs font-bold uppercase text-cyan-300">{group === 'invoices' ? 'Invoices, quotes and orders' : group}</h3><div className="space-y-2">{items.map(item => {
        const accountId = group === 'accounts' ? item.id : item.accountId
        const accountName = group === 'accounts' ? item.name || '' : item.account?.name || item.accountName || ''
        const title = group === 'contacts' ? [item.firstName, item.lastName].filter(Boolean).join(' ') || item.email || 'Contact' : item.name || `${item.docType || 'Record'} ${item.invoiceNumber || item.zohoId || item.id}`
        const phone = item.mobilePhone || item.phone
        const context: CommunicationContext = group === 'products' ? { kind: 'product', recordId: item.id, productSearch: item.sku || item.name, title } : { kind: item.docType || 'account', accountId, recordId: group === 'accounts' ? undefined : item.id, title: accountName || title }
        const href = accountId ? `/account?id=${encodeURIComponent(accountId)}${group === 'invoices' ? `&invoiceId=${encodeURIComponent(item.zohoId || item.id)}` : ''}` : undefined
        return <article key={`${group}-${item.id}`} className="rounded-xl border border-white/10 p-3 text-sm break-words">
          <strong>{title}</strong><p className="mt-1 text-xs text-neutral-400">{[accountName !== title ? accountName : '', item.sku, item.stage || item.status, phone, item.email].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {group === 'invoices' ? <button onClick={() => { setDocument(item); onOpenRecord() }} className="rounded-lg bg-white/10 px-3 py-2">Open {item.docType === 'SalesOrder' ? 'order' : item.docType?.toLowerCase() || 'document'}</button> : href && <Link href={href} onClick={() => { publishCommunicationContext(context); onOpenRecord() }} className="rounded-lg bg-white/10 px-3 py-2">Open record</Link>}
            {group === 'products' && <button onClick={() => { showProduct(item.sku || title, item); onOpenRecord() }} className="rounded-lg bg-white/10 px-3 py-2">View product</button>}
            {accountId && <button onClick={() => onMessages(accountId, accountName, group === 'contacts' ? item.id : undefined)} className="rounded-lg bg-white/10 px-3 py-2">Message</button>}
            {phone && accountId && <button onClick={() => { publishCommunicationContext(context); window.dispatchEvent(new CustomEvent('inAppDial', { detail: { phone, accountId, accountName, contactName: title } })) }} className="rounded-lg bg-cyan-700 px-3 py-2">Prepare call</button>}
            <button onClick={() => { publishCommunicationContext(context); window.dispatchEvent(new CustomEvent('openTitanAi', { detail: { prompt: `Help me with ${title}. Verify the current record before making recommendations. Record ID: ${item.id}${accountId ? `. Account ID: ${accountId}` : ''}.` } })) }} className="rounded-lg bg-white/10 px-3 py-2">Ask AI</button>
          </div>
        </article>
      })}</div></div>)}
    </div>
  </section>{document && <Suspense fallback={null}><InvoiceDetailsModal invoice={document} type={document.docType || 'Invoice'} onClose={() => setDocument(null)} /></Suspense>}</>
}
