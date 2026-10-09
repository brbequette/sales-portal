'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FiGift, FiRefreshCw, FiSearch } from 'react-icons/fi'
import { useProductModal } from '@/components/ProductModalProvider'

type Gift = { id: string; sku: string; name: string; category: string; stock: number; price: number; vendor: string | null; manufacturer: string | null; size: string | null; imageUrl: string | null; updatedAt: string }

export default function GiftInventoryPage() {
  const [products, setProducts] = useState<Gift[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [availability, setAvailability] = useState('all')
  const [sort, setSort] = useState('name')
  const { showProduct } = useProductModal()
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/gift-inventory', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !Array.isArray(data.products)) throw new Error(data.error || 'Gift inventory could not be loaded.')
      setProducts(data.products)
    } catch (e) { setError(e instanceof Error ? e.message : 'Gift inventory could not be loaded.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const visible = useMemo(() => products.filter(p => {
    const matches = [p.name, p.sku, p.vendor, p.manufacturer, p.size, p.category].join(' ').toLowerCase().includes(search.trim().toLowerCase())
    return matches && (availability === 'all' || (availability === 'in' && p.stock > 0) || (availability === 'low' && p.stock > 0 && p.stock <= 5) || (availability === 'out' && p.stock <= 0))
  }).sort((a, b) => sort === 'stock' ? a.stock - b.stock || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)), [products, search, availability, sort])
  const quantities = products.reduce((sum, p) => sum + Math.max(0, p.stock), 0)
  return <div className="mx-auto w-full max-w-7xl px-4 py-6 pb-36 text-white sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-purple-300"><FiGift />Promotional products</div><h1 className="text-3xl font-bold tracking-tight">Gift inventory</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">See saved stock levels before including a gift in an offer. Select a gift to view its product details.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/catalog" className="rounded-xl border border-white/15 px-4 py-3 text-sm">Product catalog</Link><button disabled={loading} onClick={() => void load()} className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold disabled:opacity-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} />Refresh saved inventory</button></div>
    </header>
    <p className="mt-4 rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs leading-5 text-neutral-400">These are saved catalog quantities, not a live warehouse count or a reservation. Refresh reloads Titan’s saved data and does not call Zoho. Zero may indicate no stock or an unmaintained stock field; confirm availability before promising a gift.</p>
    {error && <div role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{error} {products.length > 0 && 'Previously loaded figures remain below.'}<button onClick={() => void load()} disabled={loading} className="ml-3 underline">Retry</button></div>}
    <section aria-label="Gift inventory totals" className="my-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Gift SKUs', products.length], ['Saved units on hand', quantities], ['Low stock · 1–5 units', products.filter(p => p.stock > 0 && p.stock <= 5).length], ['Zero or negative stock', products.filter(p => p.stock <= 0).length]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><p className="text-xs text-neutral-400">{label}</p><p className="mt-2 text-2xl font-bold">{loading && !products.length ? '—' : value.toLocaleString()}</p></div>)}</section>
    <section aria-label="Filter gifts" className="mb-5 flex flex-col gap-3 sm:flex-row">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/15 bg-black/20 px-3"><FiSearch className="shrink-0 text-neutral-500" /><input aria-label="Search gift inventory" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, SKU, vendor or size" className="min-w-0 w-full bg-transparent py-3 text-sm outline-none" /></label>
      <select aria-label="Stock filter" value={availability} onChange={e => setAvailability(e.target.value)} className="rounded-xl border border-white/15 bg-neutral-950 p-3 text-sm"><option value="all">All stock levels</option><option value="in">Positive stock</option><option value="low">Low stock · 1–5 units</option><option value="out">Zero or negative stock</option></select>
      <select aria-label="Sort gifts" value={sort} onChange={e => setSort(e.target.value)} className="rounded-xl border border-white/15 bg-neutral-950 p-3 text-sm"><option value="name">Name A–Z</option><option value="stock">Stock: lowest first</option></select>
    </section>
    <p role="status" className="mb-3 text-xs text-neutral-400">{loading ? 'Loading saved gifts…' : `${visible.length} of ${products.length} gift products`}</p>
    {!loading && !error && !visible.length && <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-neutral-400">{products.length ? 'No gifts match these filters.' : 'No products are marked as gifts yet. Gift classification is managed in the product catalog.'}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(p => <button key={p.id} onClick={() => showProduct(p.sku, p)} aria-label={`View gift ${p.name} (${p.sku})`} className="min-w-0 rounded-2xl border border-white/10 bg-white/[.035] p-4 text-left transition hover:border-purple-400/50 focus-visible:outline-2 focus-visible:outline-purple-400">
      <div className="flex gap-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-black/30">{p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full rounded-xl object-contain" /> : <FiGift size={28} className="text-purple-400" />}</div><div className="min-w-0"><p className="break-all text-xs text-purple-300">{p.sku}</p><h2 className="mt-1 break-words font-semibold">{p.name}</h2>{p.size && <p className="mt-1 text-xs text-neutral-400">Size: {p.size}</p>}</div></div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3"><span className="text-xs text-neutral-400">Saved stock</span><span className={`rounded-full px-3 py-1 text-sm font-bold ${p.stock <= 0 ? 'bg-red-500/10 text-red-300' : p.stock <= 5 ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{p.stock.toLocaleString()} units</span></div>
      <p className="mt-3 truncate text-xs text-neutral-400">{p.vendor || p.manufacturer || 'Vendor not recorded'}</p><p className="mt-1 text-[11px] text-neutral-500">Product updated {new Date(p.updatedAt).toLocaleDateString()}</p>
    </button>)}</div>
  </div>
}
