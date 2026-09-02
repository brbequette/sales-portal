"use client";

import { Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PublicProductImage } from '@/components/PublicProductImage';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FiArrowLeft, FiArrowRight, FiAward, FiBox, FiCheckCircle, FiChevronDown, FiFilter, FiLock, FiSearch, FiSliders, FiTag, FiX } from 'react-icons/fi';
import imageMapData from '@/lib/image-map.json';
import { publicUseCases } from '@/lib/public-product-normalization';
import { SHOW_PUBLIC_SKUS } from '@/lib/public-catalog-visibility';

type RawProduct = {
  id: string; name: string; sku: string; category?: string | null; imageUrl?: string | null; description?: string | null;
  price?: number; stock?: number; giftItem?: boolean; size?: string | null; application?: string | null;
  vendor?: string | null; productType?: string | null; toolType?: string | null; equipment?: string | null; materials?: unknown; useCases?: unknown; attributes?: unknown;
};
type PublicAttributes = { segmentHeight?: string; slotType?: string };
type CatalogProduct = {
  id: string; name: string; sku: string; category: string; imageUrl: string; description: string; size: string; application: string;
  productType: string; toolType: string; equipment: string; useCases: string[]; sizes: string[]; technical: PublicAttributes; searchable: string; specialty: boolean;
};
type Filters = { category: string; useCase: string; size: string; productType: string; equipment: string; specialty: string };
type SortMode = 'featured' | 'name-asc' | 'name-desc' | 'sku-asc';

const imageMap = imageMapData as Record<string, { image?: string | null }>;
const EMPTY_FILTERS: Filters = { category: '', useCase: '', size: '', productType: '', equipment: '', specialty: '' };
const PAGE_SIZES = [24, 48, 96];
const SPECIALTY_FAMILIES = ['battle axe', 'barbarian', 'dark knight', 'dragon', 'king', 'maximus', 'medusa', 'spartan', 'wizard', 'zeus', 'champion'];
const isSpecialtyName = (name: string) => SPECIALTY_FAMILIES.some((family) => name.includes(family)) || /\bthe titan\b/.test(name);
const isGiftLike = (item: RawProduct) => /\b(t-?shirt|shirt|hat|cap|knife|gift|giveaway|promo item)\b/i.test(`${item.name} ${item.category || ''}`);

function values(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  return [];
}
function unique(items: string[]) { return [...new Set(items.map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); }
function canonicalSizes(raw: string) {
  return unique(values(raw).flatMap((value) => {
    const cleaned = value.trim().replace(/[”″]/g, '"');
    const match = cleaned.match(/^(\d+(?:\.\d+|\s+\d+\/\d+|-\d+\/\d+|\/\d+)?)/);
    return match ? [`${match[1].replace('-', ' ')}"`] : [];
  }));
}
function parseProduct(item: RawProduct): CatalogProduct {
  let parsed: Record<string, unknown> = {};
  let description = item.description || '';
  try {
    if (item.description?.trim().startsWith('{')) {
      parsed = JSON.parse(item.description);
      description = String(parsed.text || parsed.pertinentInfo || '');
    }
  } catch { /* Keep plain description. */ }
  const attributes = item.attributes && typeof item.attributes === 'object' ? item.attributes as Record<string, unknown> : {};
  const sku = item.sku.trim();
  const mapped = imageMap[sku.toUpperCase()]?.image;
  const stored = item.imageUrl || (typeof parsed.image === 'string' ? parsed.image : '');
  const category = item.category && item.category !== 'Uncategorized' ? item.category : item.productType || item.toolType || 'Diamond Tooling';
  const materials = unique([...values(item.materials), ...values(attributes.materials), ...values(attributes.suitableMaterials)]);
  const size = item.size || String(attributes.size || attributes.sizes || '');
  const application = item.application || String(attributes.application || attributes.applications || '');
  const equipment = item.equipment || String(attributes.equipment || '');
  const imageUrl = mapped || (!/placeholder|no[-_ ]?image|image[-_ ]?not[-_ ]?available/i.test(stored) ? stored : '');
  const searchable = [item.name, sku, category, item.productType, item.toolType, size, application, equipment, materials.join(' '), description, 'Titan Diamond USA'].filter(Boolean).join(' ').toLowerCase();
  const canonicalText = [application, equipment, materials.join(' '), description, item.productType, item.toolType].filter(Boolean).join(' ');
  const useCases = publicUseCases([...values(item.useCases), canonicalText]);
  const technical = attributes as PublicAttributes;
  const specialty = isSpecialtyName(`${item.name} ${category}`.toLowerCase());
  return { id: item.id || sku, name: item.name, sku, category, imageUrl, description, size, application: useCases.join(' · '), productType: item.productType || '', toolType: item.toolType || '', equipment, useCases, sizes: canonicalSizes(size), technical, searchable, specialty };
}

function ShopContent() {
  const params = useSearchParams();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState(params.get('q') || '');
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, category: params.get('category') || '' });
  const [sort, setSort] = useState<SortMode>('featured');
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<CatalogProduct | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/public/products').then(async (response) => {
      if (!response.ok) throw new Error('Catalog request failed');
      const payload = await response.json();
      const rows = (Array.isArray(payload) ? payload : payload.products || []) as RawProduct[];
      if (active) setProducts(rows.filter((item) => !item.giftItem && !isGiftLike(item) && Boolean(item.imageUrl)).map(parseProduct).filter((item) => Boolean(item.imageUrl)));
    }).catch((error) => console.error('Failed to fetch catalog:', error)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const facets = useMemo(() => ({
    category: unique(products.map((item) => item.category)),
    useCase: unique(products.flatMap((item) => item.useCases)),
    size: unique(products.flatMap((item) => item.sizes)),
    productType: unique(products.map((item) => item.productType)),
    equipment: unique(products.flatMap((item) => values(item.equipment))),
  }), [products]);

  const results = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const list = products.filter((item) => {
      if (terms.some((term) => !item.searchable.includes(term))) return false;
      if (filters.category && item.category.toLowerCase() !== filters.category.toLowerCase()) return false;
      if (filters.useCase && !item.useCases.includes(filters.useCase)) return false;
      if (filters.size && !item.sizes.includes(filters.size)) return false;
      if (filters.productType && item.productType !== filters.productType) return false;
      if (filters.equipment && !values(item.equipment).includes(filters.equipment)) return false;
      if (filters.specialty === 'yes' && !item.specialty) return false;
      return true;
    });
    return list.sort((a, b) => {
      const specialtyRank = Number(b.specialty) - Number(a.specialty);
      if (specialtyRank) return specialtyRank;
      if (sort === 'name-asc') return a.name.localeCompare(b.name, undefined, { numeric: true });
      if (sort === 'name-desc') return b.name.localeCompare(a.name, undefined, { numeric: true });
      if (sort === 'sku-asc') return a.sku.localeCompare(b.sku, undefined, { numeric: true });
      const aImage = imageMap[a.sku.toUpperCase()]?.image ? 1 : 0;
      const bImage = imageMap[b.sku.toUpperCase()]?.image ? 1 : 0;
      return bImage - aImage || a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }, [products, query, filters, sort]);

  useEffect(() => setPage(1), [query, filters, sort, pageSize]);
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = results.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeFilters = Object.entries(filters).filter(([, value]) => value);
  const clearAll = () => { setQuery(''); setFilters(EMPTY_FILTERS); };

  return (
    <div className="catalog-page relative min-h-screen bg-neutral-950 text-white">
      {selected && <ProductModal product={selected} onClose={() => setSelected(null)} />}
      <section className="border-b border-white/10 px-4 pb-12 pt-14 text-center sm:pt-20">
        <span className="public-kicker"><FiCheckCircle /> Live contractor catalog</span>
        <h1 className="mt-5 text-4xl font-black uppercase tracking-[-.045em] sm:text-6xl">Find the right tool.<br /><span className="text-orange-400">Fast.</span></h1>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-neutral-400">Search Titan tooling by product, SKU, cut type, size, or equipment. Guest browsing is open; contractor pricing stays protected.</p>
      </section>

      <div className="mx-auto max-w-[94rem] px-4 py-8 sm:px-6 lg:px-8">
        <div className="sticky top-0 z-30 mb-6 rounded-b-2xl border border-t-0 border-white/10 bg-neutral-950/90 p-3 shadow-2xl backdrop-blur-2xl sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="relative flex-1">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU, cut type, saw, size…" className="h-12 w-full rounded-xl border border-white/10 bg-black/60 pl-11 pr-11 text-sm text-white outline-none transition focus:border-orange-400/60 focus:ring-4 focus:ring-orange-500/10" />
              {query && <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white"><FiX /></button>}
            </label>
            <button onClick={() => setFilterOpen(!filterOpen)} className={`flex h-12 items-center justify-center gap-2 rounded-xl border px-5 text-xs font-black uppercase tracking-wider lg:hidden ${filterOpen || activeFilters.length ? 'border-orange-400/50 bg-orange-500/10 text-orange-300' : 'border-white/10 bg-white/5 text-neutral-300'}`}><FiFilter /> Filters {activeFilters.length > 0 && `(${activeFilters.length})`}</button>
            <div className="relative min-w-52"><FiSliders className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-orange-400" /><select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label="Sort products" className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-black/60 pl-11 pr-10 text-xs font-bold text-white outline-none focus:border-orange-400/60"><option value="featured">Featured first</option><option value="name-asc">Name: A–Z</option><option value="name-desc">Name: Z–A</option><option value="sku-asc">SKU: A–Z</option></select><FiChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500" /></div>
          </div>
        </div>

        <div className="grid gap-7 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className={`${filterOpen ? 'block' : 'hidden'} h-fit rounded-2xl border border-white/10 bg-neutral-900/70 p-5 lg:sticky lg:top-24 lg:block`}>
            <div className="mb-5 flex items-center justify-between"><h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest"><FiFilter className="text-orange-400" /> Refine results</h2>{(activeFilters.length > 0 || query) && <button onClick={clearAll} className="text-[10px] font-bold uppercase text-orange-400 hover:text-orange-300">Clear all</button>}</div>
            <div className="space-y-4">
              <button type="button" onClick={() => setFilters({ ...filters, specialty: filters.specialty === 'yes' ? '' : 'yes' })} aria-pressed={filters.specialty === 'yes'} className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-xs font-black uppercase ${filters.specialty === 'yes' ? 'border-orange-400 bg-orange-500/15 text-orange-200' : 'border-orange-400/25 bg-orange-500/5 text-orange-300'}`}><span><FiAward className="mr-2 inline" />Titan specialty blades</span><span>{filters.specialty === 'yes' ? 'On' : 'View'}</span></button>
              <Facet label="Category" value={filters.category} options={facets.category} onChange={(value) => setFilters({ ...filters, category: value })} />
              <Facet label="Product type" value={filters.productType} options={facets.productType} onChange={(value) => setFilters({ ...filters, productType: value })} />
              <Facet label="Cuts / application" value={filters.useCase} options={facets.useCase} onChange={(value) => setFilters({ ...filters, useCase: value })} />
              <Facet label="Size" value={filters.size} options={facets.size} onChange={(value) => setFilters({ ...filters, size: value })} />
              <Facet label="Saw / equipment" value={filters.equipment} options={facets.equipment} onChange={(value) => setFilters({ ...filters, equipment: value })} />
            </div>
            <Link href="/blade-finder" className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-orange-300"><FiSliders /> Not sure? Use blade finder</Link>
          </aside>

          <main className="min-w-0">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div><div className="text-sm font-black text-white">{loading ? 'Loading products…' : `${results.length.toLocaleString()} products found`}</div>{!loading && results.length > 0 && <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-neutral-500">Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, results.length)} of {results.length.toLocaleString()}</div>}</div>
              <div className="flex items-center gap-2"><span className="text-[10px] uppercase tracking-wider text-neutral-500">Per page</span>{PAGE_SIZES.map((size) => <button key={size} onClick={() => setPageSize(size)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${pageSize === size ? 'border-orange-400/50 bg-orange-500/10 text-orange-300' : 'border-white/10 text-neutral-500 hover:text-white'}`}>{size}</button>)}</div>
            </div>
            {(query || activeFilters.length > 0) && <div className="mb-5 flex flex-wrap gap-2">{query && <FilterChip label={`Search: ${query}`} onClear={() => setQuery('')} />}{activeFilters.map(([key, value]) => <FilterChip key={key} label={`${key}: ${value}`} onClear={() => setFilters({ ...filters, [key]: '' })} />)}</div>}

            {loading ? <LoadingGrid /> : visible.length === 0 ? <EmptyState onReset={clearAll} /> : <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visible.map((product) => <ProductCard key={product.id} product={product} onSelect={() => setSelected(product)} />)}</div>}
            {!loading && totalPages > 1 && <Pagination page={currentPage} total={totalPages} onChange={(value) => { setPage(value); window.scrollTo({ top: 420, behavior: 'smooth' }); }} />}
          </main>
        </div>
      </div>
    </div>
  );
}

function Facet({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-2 block font-mono text-[9px] font-bold uppercase tracking-[.16em] text-neutral-500">{label}</span><div className="relative"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-black/60 px-3 pr-9 text-xs text-neutral-200 outline-none focus:border-orange-400/50"><option value="">All {label.toLowerCase()}s</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select><FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600" /></div></label>;
}
function FilterChip({ label, onClear }: { label: string; onClear: () => void }) { return <button onClick={onClear} className="inline-flex max-w-full items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold capitalize text-orange-200"><span className="truncate">{label}</span><FiX /></button>; }
function ProductCard({ product, onSelect }: { product: CatalogProduct; onSelect: () => void }) {
  return <article onClick={onSelect} className={`group flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-neutral-900/70 transition hover:-translate-y-1 ${product.specialty ? 'border border-orange-400/55 shadow-[0_16px_45px_rgba(249,115,22,.12)]' : 'border border-white/10 hover:border-orange-400/40'}`}>
    <div className="relative flex h-56 items-center justify-center overflow-hidden border-b border-white/5 bg-black/55 p-6"><PublicProductImage src={product.imageUrl} alt={product.name} className="transition duration-500 group-hover:scale-105 group-hover:rotate-1" /><span className="absolute left-3 top-3 max-w-[80%] truncate rounded-full border border-orange-400/25 bg-black/75 px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-wider text-orange-300 backdrop-blur">{product.specialty ? 'Titan Featured Specialty' : product.category}</span></div>
    <div className="flex flex-1 flex-col p-5">{SHOW_PUBLIC_SKUS && <div className="font-mono text-[9px] uppercase tracking-wider text-neutral-500">SKU {product.sku}</div>}<h3 className="mt-1 line-clamp-2 text-sm font-black uppercase leading-5 text-white transition group-hover:text-orange-300">{product.name}</h3>{(product.size || product.application || product.equipment) && <div className="mt-3 flex flex-wrap gap-1.5">{product.size && <span className="rounded-md bg-white/5 px-2 py-1 text-[9px] text-neutral-400">{product.size}</span>}{product.application && <span className="max-w-full truncate rounded-md bg-white/5 px-2 py-1 text-[9px] text-neutral-400">{product.application}</span>}{product.equipment && <span className="max-w-full truncate rounded-md bg-orange-500/10 px-2 py-1 text-[9px] text-orange-200">{product.equipment}</span>}</div>}<div className="mt-auto flex items-center justify-between border-t border-white/10 pt-4 text-[10px] font-black uppercase tracking-wider"><span className="flex items-center gap-1.5 text-orange-400"><FiLock /> Login for pricing</span><span className="flex items-center gap-1 text-neutral-300 group-hover:text-orange-300">See full details <FiArrowRight /></span></div></div>
  </article>;
}
function LoadingGrid() { return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 12 }, (_, index) => <div key={index} className="h-96 animate-pulse rounded-2xl border border-white/5 bg-white/[.025]" />)}</div>; }
function EmptyState({ onReset }: { onReset: () => void }) { return <div className="rounded-3xl border border-white/10 bg-neutral-900/50 px-6 py-20 text-center"><FiBox className="mx-auto text-neutral-600" size={42} /><h3 className="mt-4 text-xl font-black uppercase">No exact matches</h3><p className="mt-2 text-xs text-neutral-500">Remove a filter or try a broader product, SKU, material, or application term.</p><button onClick={onReset} className="mt-6 rounded-xl bg-orange-500 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-black">Reset catalog</button></div>; }
function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pages = [...new Set([1, total, ...Array.from({ length: 5 }, (_, index) => Math.max(1, Math.min(total, page - 2 + index)))])].sort((a, b) => a - b);
  return <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Catalog pages"><button disabled={page === 1} onClick={() => onChange(page - 1)} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-[10px] font-bold uppercase text-neutral-300 disabled:opacity-30"><FiArrowLeft /> Previous</button>{pages.map((value, index) => <span key={value} className="contents">{index > 0 && value - pages[index - 1] > 1 && <span className="text-neutral-600">…</span>}<button onClick={() => onChange(value)} aria-current={page === value ? 'page' : undefined} className={`h-10 min-w-10 rounded-xl border text-xs font-bold ${page === value ? 'border-orange-400 bg-orange-500 text-black' : 'border-white/10 text-neutral-400 hover:text-white'}`}>{value}</button></span>)}<button disabled={page === total} onClick={() => onChange(page + 1)} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-[10px] font-bold uppercase text-neutral-300 disabled:opacity-30">Next <FiArrowRight /></button></nav>;
}
function ProductModal({ product, onClose }: { product: CatalogProduct; onClose: () => void }) {
  if (typeof document === 'undefined') return null;
  const quoteUrl = `/contact?product=${encodeURIComponent(product.name)}&sku=${encodeURIComponent(product.sku)}`;
  return createPortal(<div className="fixed inset-0 z-[11000] overflow-y-auto bg-black/90 p-2 backdrop-blur-xl sm:p-5" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={product.name} className="product-detail-shell relative mx-auto my-2 w-full max-w-7xl overflow-hidden rounded-3xl border border-orange-400/25 bg-[#080808] shadow-2xl sm:my-5" onClick={(event) => event.stopPropagation()}>
      <button onClick={onClose} aria-label="Close product details" className="absolute right-4 top-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/85 text-neutral-300 backdrop-blur hover:border-orange-400/60 hover:text-white"><FiX size={24} /></button>
      <div className="product-detail-stripe" aria-hidden="true" />
      <div className="grid lg:grid-cols-[.82fr_1.18fr]">
        <div className="relative flex min-h-[26rem] items-center justify-center overflow-hidden border-b border-white/10 bg-black/65 p-8 lg:min-h-[42rem] lg:border-b-0 lg:border-r">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(249,115,22,.14),transparent_48%)]" />
          <PublicProductImage src={product.imageUrl} alt={product.name} className="relative z-10 max-h-[34rem] max-w-full" />
          <div className="absolute bottom-5 left-5 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[.16em] text-neutral-500"><FiAward className="text-orange-400" /> Titan contractor tooling</div>
        </div>
        <div className="p-6 sm:p-9 lg:p-11">
          <span className="rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-orange-300">{product.category}</span>
          <h2 className="mt-4 max-w-3xl text-3xl font-black uppercase leading-[.95] tracking-[-.035em] sm:text-5xl">{product.name}</h2>
          <div className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-neutral-500"><FiTag /> Titan Diamond USA · SKU {product.sku}</div>
          {product.description && <p className="mt-6 max-w-3xl text-sm leading-7 text-neutral-300">{product.description}</p>}
          <h3 className="mt-8 text-[10px] font-black uppercase tracking-[.2em] text-orange-400">Complete product details</h3>
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 text-xs sm:grid-cols-3">
            <Spec label="Brand" value="Titan Diamond USA" />
            {product.productType && <Spec label="Product type" value={product.productType} />}
            {product.toolType && <Spec label="Tool type" value={product.toolType} />}
            {product.size && <Spec label="Size / diameter" value={product.size} />}
            {product.useCases.length > 0 && <Spec label="Cuts / applications" value={product.useCases.join(' · ')} />}
            {product.equipment && <Spec label="Equipment" value={product.equipment} />}
            {product.technical.segmentHeight && <Spec label="Segment height" value={product.technical.segmentHeight} />}
            {product.technical.slotType && <Spec label="Slot type" value={product.technical.slotType} />}
          </dl>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row"><Link href="/login" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-4 text-center text-[10px] font-black uppercase tracking-wider text-black"><FiLock /> Create account or login to view pricing</Link><Link href={quoteUrl} className="rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-center text-[10px] font-black uppercase tracking-wider text-white">Request product quote</Link></div>
        </div>
      </div>

    </div>
  </div>, document.body);
}
function Spec({ label, value }: { label: string; value: string }) { return <div className="min-w-0 bg-black/75 p-3"><dt className="font-mono text-[8px] uppercase tracking-wider text-neutral-600">{label}</dt><dd className="mt-1 overflow-wrap-anywhere text-[10px] leading-4 text-neutral-300">{value}</dd></div>; }

export default function ShopClient() { return <Suspense fallback={<div className="min-h-screen bg-neutral-950" />}><ShopContent /></Suspense>; }
