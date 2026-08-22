"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FiArrowLeft, FiCheck, FiGift, FiSave, FiSearch } from 'react-icons/fi';
import type { ProductOffer } from '@/lib/product-offers';

type OfferProduct = { id: string; sku: string; name: string; category: string; giftItem: boolean; imageUrl?: string | null; offer: ProductOffer };

export default function ProductOffersPage() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<OfferProduct[]>([]);
  const [selected, setSelected] = useState<OfferProduct | null>(null);
  const [offer, setOffer] = useState<ProductOffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function search() {
    setLoading(true); setMessage('');
    const response = await fetch(`/api/admin/product-offers?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    setProducts(data.products || []); setLoading(false);
  }
  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function choose(product: OfferProduct) { setSelected(product); setOffer(structuredClone(product.offer)); setMessage(''); }
  function updateTier(index: number, field: string, value: unknown) {
    if (!offer) return;
    setOffer({ ...offer, tiers: offer.tiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, [field]: value } : tier) });
  }
  async function save() {
    if (!selected || !offer) return;
    setLoading(true); setMessage('');
    const response = await fetch('/api/admin/product-offers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: selected.id, offer }) });
    const data = await response.json(); setLoading(false);
    if (!response.ok) { setMessage(data.error || 'Unable to save offer.'); return; }
    setOffer(data.offer); setMessage('Offer configuration saved.');
  }

  return <div className="min-h-screen bg-neutral-950 px-4 py-8 text-white sm:px-6 lg:px-10">
    <div className="mx-auto max-w-[100rem]">
      <Link href="/admin" className="inline-flex items-center gap-2 text-xs font-bold text-neutral-500 hover:text-orange-400"><FiArrowLeft /> Admin</Link>
      <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><span className="font-mono text-[10px] font-black uppercase tracking-[.2em] text-orange-400">Offer control center</span><h1 className="mt-2 text-4xl font-black uppercase tracking-tight sm:text-6xl">Product volume & gift tiers</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">Assign package prices, volume discounts, and qualifying giveaway SKUs to any catalog product. Nothing appears publicly until a tier is active.</p></div>{selected && <button onClick={save} disabled={loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 text-xs font-black uppercase tracking-wider text-black disabled:opacity-50"><FiSave /> Save offer</button>}</div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-white/10 bg-neutral-900/70 p-4 xl:sticky xl:top-4">
          <div className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && search()} placeholder="Search product or SKU" className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black px-3 text-xs outline-none focus:border-orange-400" /><button onClick={search} className="grid h-11 w-11 place-items-center rounded-xl bg-orange-500 text-black"><FiSearch /></button></div>
          <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1">{products.map((product) => <button key={product.id} onClick={() => choose(product)} className={`w-full rounded-xl border p-3 text-left ${selected?.id === product.id ? 'border-orange-400 bg-orange-500/10' : 'border-white/5 bg-black/35 hover:border-white/15'}`}><div className="truncate text-xs font-black uppercase">{product.name}</div><div className="mt-1 flex justify-between gap-2 font-mono text-[9px] text-neutral-500"><span>{product.sku}</span>{product.giftItem && <span className="text-blue-300">GIFT ITEM</span>}</div></button>)}</div>
        </aside>
        {!selected || !offer ? <div className="grid min-h-96 place-items-center rounded-3xl border border-dashed border-white/10 text-sm text-neutral-600">Select a product to configure its offer ladder.</div> : <main className="rounded-3xl border border-white/10 bg-neutral-900/45 p-5 sm:p-8">
          <div className="flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-center"><div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-black p-2">{selected.imageUrl ? <img src={selected.imageUrl} alt="" className="h-full w-full object-contain" /> : <FiGift className="text-neutral-700" size={28} />}</div><div><p className="font-mono text-[10px] text-orange-400">{selected.sku}</p><h2 className="mt-1 text-2xl font-black uppercase">{selected.name}</h2><label className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={offer.enabled} onChange={(event) => setOffer({ ...offer, enabled: event.target.checked })} /> Enable product offer program</label></div></div>
          <div className="mt-6 grid gap-4 md:grid-cols-2"><label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Public headline<input value={offer.headline} onChange={(event) => setOffer({ ...offer, headline: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black px-3 text-xs normal-case text-white outline-none" /></label><label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Public supporting copy<input value={offer.subheadline} onChange={(event) => setOffer({ ...offer, subheadline: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black px-3 text-xs normal-case text-white outline-none" /></label></div>
          <div className="mt-7 overflow-x-auto"><table className="w-full min-w-[68rem] border-separate border-spacing-y-2 text-xs"><thead className="text-left font-mono text-[9px] uppercase tracking-wider text-neutral-600"><tr><th>Active</th><th>Spend tier</th><th>Discount %</th><th>Package price</th><th>Giveaway SKU</th><th>Gift value</th><th>Internal/public note</th></tr></thead><tbody>{offer.tiers.map((tier, index) => <tr key={tier.threshold} className="bg-black/45"><td className="rounded-l-xl p-3"><input type="checkbox" checked={tier.active} onChange={(event) => updateTier(index, 'active', event.target.checked)} /></td><td className="p-3 text-base font-black">${tier.threshold.toLocaleString()}</td><td className="p-2"><input type="number" min="0" max="100" value={tier.discountPercent ?? ''} onChange={(event) => updateTier(index, 'discountPercent', event.target.value === '' ? null : Number(event.target.value))} className="h-10 w-24 rounded-lg border border-white/10 bg-neutral-950 px-2" /></td><td className="p-2"><input type="number" min="0" value={tier.packagePrice ?? ''} onChange={(event) => updateTier(index, 'packagePrice', event.target.value === '' ? null : Number(event.target.value))} className="h-10 w-28 rounded-lg border border-white/10 bg-neutral-950 px-2" /></td><td className="p-2"><input value={tier.giftSku} onChange={(event) => updateTier(index, 'giftSku', event.target.value.toUpperCase())} placeholder="Any valid SKU" className="h-10 w-36 rounded-lg border border-white/10 bg-neutral-950 px-2 font-mono" /></td><td className="p-2"><input type="number" min="0" value={tier.giftValue ?? ''} onChange={(event) => updateTier(index, 'giftValue', event.target.value === '' ? null : Number(event.target.value))} className="h-10 w-24 rounded-lg border border-white/10 bg-neutral-950 px-2" /></td><td className="rounded-r-xl p-2"><input value={tier.note} onChange={(event) => updateTier(index, 'note', event.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-neutral-950 px-2" /></td></tr>)}</tbody></table></div>
          {message && <div className={`mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs ${message.includes('saved') ? 'border-green-400/30 bg-green-500/10 text-green-300' : 'border-red-400/30 bg-red-500/10 text-red-300'}`}><FiCheck /> {message}</div>}
        </main>}
      </div>
    </div>
  </div>;
}
