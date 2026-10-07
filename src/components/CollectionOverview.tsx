'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiArrowUpRight, FiX } from 'react-icons/fi'
import { groupDocumentLines, type OverviewDocument } from '@/lib/collection-overview'
import type { Invoice } from './CollectionsModal'

const money = (n: unknown) => typeof n === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n) : 'Not recorded'
const date = (v: string | null) => v ? v.slice(0, 10) : 'Not recorded'
const label = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
type Detail = { title: string; data: any }
type Overview = { account: any; documents: OverviewDocument[]; packages: any[]; purchases: any[]; payments: any[]; missingOrderLinks: boolean }
const tabs = ['Overview', 'People & account', 'Items & costs', 'Documents', 'Shipping', 'Payments']

function Fields({ data }: { data: any }) {
  if (data === null || data === undefined || data === '') return <span className="text-neutral-500">Not recorded</span>
  if (typeof data !== 'object') return <span className="whitespace-pre-wrap break-words">{typeof data === 'boolean' ? data ? 'Yes' : 'No' : String(data)}</span>
  if (Array.isArray(data)) return <div className="space-y-3">{data.length ? data.map((value, i) => <div key={i} className="rounded-lg border border-white/10 p-3"><Fields data={value} /></div>) : 'None recorded'}</div>
  return <dl className="space-y-3">{Object.entries(data).filter(([key]) => key !== 'id').map(([key, value]) => <div key={key} className="grid grid-cols-[minmax(100px,1fr)_minmax(0,2fr)] gap-3"><dt className="text-neutral-400">{label(key)}</dt><dd className="min-w-0">{typeof value === 'number' && /(?:price|cost|charge|balance|amount|total|shipping)$/i.test(key) ? money(value) : <Fields data={value} />}</dd></div>)}</dl>
}

function DetailPanel({ detail, close }: { detail: Detail; close: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  return createPortal(<div className="fixed inset-0 z-[15000] bg-black/65 flex justify-end" onClick={close}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label={detail.title} tabIndex={-1} onClick={e => e.stopPropagation()} onKeyDown={e => {
      if (e.key === 'Escape') { e.stopPropagation(); close() }
      if (e.key === 'Tab') { e.preventDefault(); panel.current?.querySelector('button')?.focus() }
    }} className="w-full sm:max-w-2xl h-[100dvh] bg-[#0b1119] text-white shadow-2xl flex flex-col outline-none">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 p-5"><h2 className="font-bold text-lg">{detail.title}</h2><button aria-label="Close detail" onClick={close} className="p-3 rounded-lg bg-white/10"><FiX /></button></header>
      <div className="overflow-y-auto min-h-0 p-5 text-sm"><Fields data={detail.data} /></div>
    </div>
  </div>, document.body)
}

export function CollectionOverview({ invoice: suppliedInvoice, invoiceId }: { invoice?: Invoice; invoiceId?: string }) {
  const [tab, setTab] = useState(tabs[0])
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [detail, setDetail] = useState<Detail | null>(null)
  const invoiceDocument = data?.documents[0]
  const invoice = suppliedInvoice || {
    id: invoiceId || '', invoice_number: invoiceDocument?.number || '…', customer_name: data?.account.name || 'Invoice',
    balance: invoiceDocument?.balance, total: invoiceDocument?.total, status: invoiceDocument?.status || '',
    due_date: invoiceDocument?.dueDate || null, days_overdue: '—', salesperson_name: invoiceDocument?.salesperson || '',
  }
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError(''); setDetail(null)
    fetch(`/api/collections/overview?id=${encodeURIComponent(invoice.id)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error || 'Overview unavailable'); return body })
      .then(body => { if (!controller.signal.aborted) setData(body) })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [invoice.id, retry])
  const card = (title: string, value: string, record: any, subtitle?: string) => <button type="button" onClick={() => setDetail({ title, data: record })} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-left hover:border-cyan-500/60 focus-visible:outline-cyan-400">
    <span className="flex justify-between gap-3 text-xs text-neutral-400">{title}<FiArrowUpRight className="shrink-0" /></span><strong className="block mt-2 break-words text-white">{value}</strong>{subtitle && <span className="block mt-1 text-xs text-neutral-400 break-words">{subtitle}</span>}
  </button>
  return <section aria-label={`Overview for invoice ${invoice.invoice_number}`} className="p-4 sm:p-6 bg-[#080e16] border-y border-cyan-500/20 whitespace-normal">
    <div className="flex flex-wrap justify-between gap-3 mb-4"><div><h3 className="text-lg font-bold text-white">{invoice.customer_name} · #{invoice.invoice_number}</h3><p className="text-xs text-neutral-400">Saved order history · select any card or item for details</p></div><div className="text-right"><strong className="text-red-400 text-lg">{money(invoice.balance)} overdue</strong><p className="text-xs text-neutral-400">{invoice.days_overdue} days · Due {date(invoice.due_date)}</p></div></div>
    <div role="tablist" aria-label="Order overview sections" className="flex gap-1 overflow-x-auto border-b border-white/10 mb-5 pb-2">{tabs.map((name, index) => <button key={name} id={`${invoice.id}-tab-${index}`} role="tab" aria-selected={tab === name} aria-controls={`${invoice.id}-panel`} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={e => {
      const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length : e.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
      if (next >= 0) { e.preventDefault(); setTab(tabs[next]); document.getElementById(`${invoice.id}-tab-${next}`)?.focus() }
    }} className={`shrink-0 rounded-lg px-3 py-2 text-sm ${tab === name ? 'bg-cyan-900 text-cyan-100' : 'text-neutral-400 hover:bg-white/5'}`}>{name}</button>)}</div>
    <div id={`${invoice.id}-panel`} role="tabpanel" aria-labelledby={`${invoice.id}-tab-${tabs.indexOf(tab)}`}>
      {error ? <div role="alert" className="text-amber-300">{error} <button className="underline p-2" onClick={() => setRetry(n => n + 1)}>Retry</button></div> : !data ? <p role="status" className="text-neutral-400">Loading saved order details…</p> : <>
        {tab === 'Overview' && <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {card('Invoice', money(invoice.balance) + ' outstanding', data.documents[0], `${money(invoice.total)} total · ${invoice.status || 'Status not recorded'}`)}
          {card('Sales representative', invoice.salesperson_name || 'Unassigned', { invoiceRep: invoice.salesperson_name, accountOwner: data.account.owner })}
          {card('Account', data.account.name, data.account, `${data.account.contacts.length} contacts · ${data.account.status || 'Status not recorded'}`)}
          {card('Fulfillment', `${data.packages.length} packages`, { packages: data.packages, purchaseOrders: data.purchases }, `${data.purchases.length} linked purchase orders`)}
          {card('Collection follow-up', date(data.account.nextActionDate), { nextActionDate: data.account.nextActionDate, lastCalledAt: data.account.lastCalledAt, dueDate: invoice.due_date })}
        </div>}
        {tab === 'People & account' && <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {card('Account profile', data.account.name, data.account, data.account.phone || 'No account phone recorded')}
          {card('Representative', invoice.salesperson_name || 'Unassigned', { invoiceRep: invoice.salesperson_name, accountOwner: data.account.owner })}
          {card('Billing address', [data.account.billingStreet, data.account.billingCity, data.account.billingState, data.account.billingZip].filter(Boolean).join(', ') || 'Not recorded', data.documents[0].billingAddress || { street: data.account.billingStreet, city: data.account.billingCity, state: data.account.billingState, zip: data.account.billingZip })}
          {card('Shipping address', [data.account.shippingStreet, data.account.shippingCity, data.account.shippingState, data.account.shippingZip].filter(Boolean).join(', ') || 'Not recorded', data.documents[0].shippingAddress || { street: data.account.shippingStreet, city: data.account.shippingCity, state: data.account.shippingState, zip: data.account.shippingZip })}
          {data.account.contacts.map((c: any) => <div key={c.id} className="contents">{card(c.isPrimary ? 'Primary contact' : 'Contact', [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unnamed contact', c, [c.phone || c.mobilePhone, c.email].filter(Boolean).join(' · '))}</div>)}
        </div>}
        {tab === 'Items & costs' && <div className="space-y-5">{groupDocumentLines(data.documents).map((group, index) => <div key={index}>
          <p className="text-sm text-cyan-300 mb-2">{group.documents.map(d => `${d.type} ${d.number}`).join(' · ')}{group.documents.length > 1 && ' — identical items shown once'}</p>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-neutral-400 text-left"><tr>{['Item', 'Qty', 'Unit price', 'Line total', 'Unit cost'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{group.lines.map((line: any, i: number) => <tr key={i} className="border-t border-white/10"><td className="p-2"><button className="text-cyan-300 text-left underline" onClick={() => setDetail({ title: line.name, data: { ...line, sourceDocuments: group.documents.map(d => `${d.type} ${d.number}`) } })}>{line.name}</button><span className="block text-xs text-neutral-500">{line.sku}</span></td><td className="p-2">{line.quantity ?? '—'}</td><td className="p-2">{money(line.unitPrice)}</td><td className="p-2">{money(line.total)}</td><td className="p-2">{money(line.unitCost)}</td></tr>)}</tbody></table></div>
        </div>)}{!data.documents.some(d => d.lines.length) && <p>No saved line items available.</p>}<p className="text-xs text-neutral-500">Differences in quantity, pricing, discounts, tax or recorded costs remain separate. Missing costs are not treated as zero.</p></div>}
        {tab === 'Documents' && <><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{data.documents.map(d => <div key={d.id} className="contents">{card(d.type, d.number || 'No number', d, `${d.status} · ${money(d.total)}`)}</div>)}{data.purchases.map((p, i) => <div key={i} className="contents">{card('Purchase order', p.number || 'No number', p, `${p.vendor || 'Vendor not recorded'} · ${money(p.total)}`)}</div>)}</div><p className="mt-4 text-xs text-neutral-400">Only explicitly linked documents are included.{data.missingOrderLinks ? ' The referenced sales order is not available in saved data.' : !data.documents.some(d => d.type === 'Sales order') ? ' No linked sales order is recorded.' : ''}{!data.documents.some(d => d.type === 'Estimate') && ' No linked estimate is recorded.'}</p></>}
        {tab === 'Shipping' && <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{card('Shipping charges & costs', money(data.documents[0].shippingCharge), { invoicedShipping: data.documents[0].shippingCharge, actualShippingCost: data.documents[0].actualShippingCost })}{data.packages.map((p, i) => <div key={i} className="contents">{card('Package', p.number || 'No package number', p, [p.carrier, p.tracking || 'Tracking not recorded', p.status].filter(Boolean).join(' · '))}</div>)}{data.purchases.filter(p => p.dropship).map((p, i) => <div key={i} className="contents">{card('Vendor shipment', p.number || 'Purchase order', p, [p.vendor, p.tracking || 'Tracking not recorded'].join(' · '))}</div>)}{!data.packages.length && <p className="text-sm text-neutral-400">No linked packages in saved data. This does not establish whether the order shipped.</p>}</div>}
        {tab === 'Payments' && <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{card('Outstanding balance', money(invoice.balance), { invoiceTotal: invoice.total, outstandingBalance: invoice.balance, dueDate: invoice.due_date })}{data.payments.map((p, i) => <div key={i} className="contents">{card('Payment', money(p.amount), p, `${date(p.date)} · ${p.mode || 'Method not recorded'}`)}</div>)}{!data.payments.length && <p className="text-sm text-neutral-400">No linked payment records in saved data.</p>}</div>}
        <p className="mt-5 text-xs text-neutral-500">Invoice saved {date(data.documents[0].updatedAt as unknown as string)}. Opening this overview does not refresh external providers.</p>
      </>}
    </div>
    {detail && <DetailPanel detail={detail} close={() => setDetail(null)} />}
  </section>
}
