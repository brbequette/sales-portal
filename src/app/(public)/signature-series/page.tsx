import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { FiArrowRight, FiCheck, FiCrosshair, FiLock, FiShield, FiStar, FiZap } from 'react-icons/fi';
import { SparkCanvas } from '@/components/SparkCanvas';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import imageMapData from '@/lib/image-map.json';
import './signature-series.css';
import { publicControlledValues, publicSizes, publicStrings } from '@/lib/public-product-normalization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Titan Signature Series Blades | Titan Diamond USA',
  description: 'Explore Titan Diamond USA Signature Series contractor blades engineered for fast cutting, long usable life, and application-matched performance.',
};

type ProductAttributes = Record<string, unknown>;
type ProductRow = { sku: string; name: string; description: string | null; category: string; size: string | null; application: string | null; equipment: string | null; materials: unknown; attributes: unknown; imageUrl: string | null };
type SignatureBlade = { family: string; name: string; image: string; description: string; category: string; applications: string[]; materials: string[]; sizes: string[]; equipment: string[]; skus: string[]; variantCount: number };
const imageMap = imageMapData as Record<string, { image?: string | null }>;
const SIGNATURE_FAMILIES = ['THE DRAGON', 'THE ZEUS', 'THE MEDUSA', 'THE BARBARIAN', 'THE DARK KNIGHT', 'THE BATTLE AXE', 'THE HOUND OF HADES', 'THE HYDRA', 'THE KING', 'THE MAXIMUS', 'THE GLADIATOR', 'THE DEMO DEMON'] as const;
const FALLBACK_IMAGES: Record<string, string> = {
  'THE DRAGON': '/product-images/cutouts-v2/dragon-formatted.png', 'THE ZEUS': '/product-images/cutouts-v2/zeus-formatted.png', 'THE MEDUSA': '/product-images/cutouts-v2/medusa-formatted.png',
  'THE BARBARIAN': '/product-images/cutouts-v2/barbarian-formatted.png', 'THE DARK KNIGHT': '/product-images/cutouts-v2/dark knight-formatted.png', 'THE BATTLE AXE': '/product-images/cutouts-v2/battle axe-formatted.png',
  'THE HOUND OF HADES': '/product-images/cutouts-v2/hounds of hades-formatted.png', 'THE HYDRA': '/product-images/cutouts-v2/hydra-formatted.png', 'THE KING': '/product-images/cutouts-v2/king-formatted.png',
  'THE MAXIMUS': '/product-images/cutouts-v2/maximus-formatted.png', 'THE GLADIATOR': '/product-images/cutouts-v2/gladiator-formatted.png', 'THE DEMO DEMON': '/product-images/cutouts-v2/demo demon-formatted.png',
};

function asStrings(value: unknown): string[] {
  return publicStrings(value);
}
function descriptionDetails(description: string | null) {
  if (!description) return { text: '', image: '' };
  try {
    const parsed = JSON.parse(description) as ProductAttributes;
    return { text: typeof parsed.text === 'string' ? parsed.text : typeof parsed.pertinentInfo === 'string' ? parsed.pertinentInfo : '', image: typeof parsed.image === 'string' && !parsed.image.includes('placeholder') ? parsed.image : '' };
  } catch { return { text: description, image: '' }; }
}
function familyFor(name: string) {
  const upper = name.toUpperCase().replace(/\s+-\s+WHS$/, '').trim();
  return SIGNATURE_FAMILIES.find((family) => upper.startsWith(family));
}
function unique(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }

async function getSignatureBlades(): Promise<SignatureBlade[]> {
  // Raw projection keeps this page compatible with containers whose generated
  // Prisma client predates the catalog-attribute migration.
  const products = await prisma.$queryRaw<ProductRow[]>(Prisma.sql`
    SELECT sku, name, description, category, size,
      application, equipment, materials, attributes, "imageUrl"
    FROM "Product"
    WHERE "giftItem" = false
    ORDER BY name ASC, sku ASC
  `);
  return SIGNATURE_FAMILIES.flatMap((family) => {
    const variants = products.filter((product) => {
      if (familyFor(product.name) !== family || /\s-\sWHS$/i.test(product.name)) return false;
      const details = descriptionDetails(product.description);
      return Boolean(imageMap[product.sku.trim().toUpperCase()]?.image || product.imageUrl || details.image);
    });
    if (!variants.length) return [];
    const primary = variants.find((product) => imageMap[product.sku.trim().toUpperCase()]?.image) ?? variants[0];
    const parsed = variants.map((product) => ({ product, details: descriptionDetails(product.description) }));
    const attributes = variants.map((product) => product.attributes && typeof product.attributes === 'object' ? product.attributes as ProductAttributes : {});
    return [{
      family, name: family,
      image: imageMap[primary.sku.trim().toUpperCase()]?.image || primary.imageUrl || parsed.find(({ details }) => details.image)?.details.image || FALLBACK_IMAGES[family],
      description: parsed.find(({ details }) => details.text)?.details.text ?? 'Commercial-grade diamond blade engineered for demanding professional cutting.',
      category: primary.category === 'Uncategorized' ? 'Signature Series Blade' : primary.category,
      applications: publicControlledValues([...variants.flatMap((product) => asStrings(product.application)), ...attributes.flatMap((item) => asStrings(item.applications ?? item.application))], 'application'),
      materials: publicControlledValues([...variants.flatMap((product) => asStrings(product.materials)), ...attributes.flatMap((item) => asStrings(item.materials ?? item.suitableMaterials))], 'material'),
      sizes: publicSizes([...variants.flatMap((product) => asStrings(product.size)), ...attributes.flatMap((item) => asStrings(item.size ?? item.sizes)), ...variants.flatMap((product) => product.name.match(/\b(?:6|7|8|9|10|12|14|16|18|20|24|26|30|36)\s*(?:\"|INCH)?$/gi) ?? []), ...parsed.flatMap(({ details }) => details.text.match(/\b(?:6|7|8|9|10|12|14|16|18|20|24|26|30|36)\s*(?:\"|INCH|X)/gi) ?? [])]),
      equipment: publicControlledValues([...variants.flatMap((product) => asStrings(product.equipment)), ...attributes.flatMap((item) => asStrings(item.equipment))], 'equipment'),
      skus: unique(variants.map((product) => product.sku)), variantCount: variants.length,
    }];
  });
}

export default async function SignatureSeriesPage() {
  const blades = await getSignatureBlades();
  return (
    <div className="signature-page relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <SparkCanvas />
      <div className="signature-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 overflow-hidden border-y border-orange-300/20 bg-orange-500 py-2.5 text-[10px] font-black uppercase tracking-[.24em] text-black sm:text-xs">
        <div className="animate-marquee inline-block whitespace-nowrap">TITAN SIGNATURE SERIES&nbsp; // &nbsp;FAST CUTTING&nbsp; // &nbsp;LONG USABLE LIFE&nbsp; // &nbsp;APPLICATION-MATCHED BONDS&nbsp; // &nbsp;CONTRACTOR DIRECT&nbsp; // &nbsp;CALL (480) 470-2577&nbsp; // &nbsp;</div>
      </div>
      <section className="relative z-10 border-b border-white/10 px-4 pb-20 pt-24 text-center sm:pb-28 sm:pt-32">
        <div className="signature-orbit relative mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-orange-400/40 bg-orange-500/10"><FiCrosshair className="text-orange-400" size={30} /></div>
        <p className="mb-5 font-mono text-[10px] font-bold uppercase tracking-[.38em] text-orange-400 sm:text-xs">Forged identity. Jobsite performance.</p>
        <h1 className="mx-auto max-w-6xl text-5xl font-black uppercase leading-[.86] tracking-[-.065em] sm:text-7xl lg:text-[7.5rem]">Cut Like A <span className="signature-metal block">Legend</span></h1>
        <p className="mx-auto mt-8 max-w-2xl text-sm leading-7 text-neutral-400 sm:text-base">Titan Signature Series blades are selected around cut speed, usable segment life, saw power, aggregate, reinforcement, and wet or dry operation. Every listed variant and SKU reflects current catalog data.</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3 text-[10px] font-black uppercase tracking-widest text-neutral-300"><span className="signature-chip"><FiShield /> Long usable life</span><span className="signature-chip"><FiZap /> Fast cutting</span><span className="signature-chip"><FiStar /> {blades.length} application-ready families</span></div>
      </section>
      <section className="relative z-10 mx-auto max-w-[94rem] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        {blades.length ? <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">{blades.map((blade, index) => (
          <article key={blade.family} className="signature-card group" style={{ '--card-index': index } as React.CSSProperties}>
            <div className="signature-card-scan" aria-hidden="true" />
            <div className="relative flex min-h-80 items-center justify-center overflow-hidden border-b border-white/10 bg-black/50 p-7 sm:min-h-96">
              <div className="signature-halo absolute h-56 w-56 rounded-full bg-orange-500/15 blur-3xl" aria-hidden="true" />
              <Image src={blade.image} alt={`${blade.name} diamond blade`} width={640} height={640} sizes="(max-width: 768px) 90vw, (max-width: 1280px) 45vw, 30vw" className="signature-blade relative z-10 h-64 w-64 object-contain drop-shadow-[0_28px_38px_rgba(0,0,0,.85)] sm:h-80 sm:w-80" />
              <div className="absolute left-5 top-5 rounded-full border border-orange-400/30 bg-black/70 px-3 py-1.5 font-mono text-[9px] font-black uppercase tracking-[.18em] text-orange-300 backdrop-blur">{String(index + 1).padStart(2, '0')} / Signature</div>
              <div className="absolute bottom-5 right-5 font-mono text-[9px] uppercase tracking-[.15em] text-neutral-500">Zoho catalog verified</div>
            </div>
            <div className="relative flex flex-1 flex-col p-6 sm:p-7">
              <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[.22em] text-orange-400">{blade.category}</p><h2 className="text-3xl font-black uppercase tracking-[-.04em] text-white sm:text-4xl">{blade.name}</h2>
              <p className="mt-4 min-h-14 text-xs leading-6 text-neutral-400">{blade.description}</p>
              <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 text-xs">
                <div className="signature-spec"><dt>Sizes</dt><dd>{blade.sizes.join(' / ') || 'See current variants'}</dd></div><div className="signature-spec"><dt>Variants</dt><dd>{blade.variantCount} active {blade.variantCount === 1 ? 'configuration' : 'configurations'}</dd></div>
                <div className="signature-spec"><dt>Brand</dt><dd>Titan Diamond USA</dd></div><div className="signature-spec"><dt>SKUs</dt><dd className="font-mono">{blade.skus.join(' · ')}</dd></div>
              </dl>
              {(blade.applications.length > 0 || blade.materials.length > 0 || blade.equipment.length > 0) && <div className="mt-5 space-y-3 text-[11px] text-neutral-300">{(blade.applications.length > 0 || blade.materials.length > 0) && <Detail label="Cuts / applications" values={[...new Set([...blade.applications, ...blade.materials])]} />}{blade.equipment.length > 0 && <Detail label="Equipment" values={blade.equipment} />}</div>}
              <div className="mt-auto flex gap-3 border-t border-white/10 pt-6"><Link href="/login" className="signature-primary flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[10px] font-black uppercase tracking-wider"><FiLock /> Contractor pricing</Link><Link href={`/contact?product=${encodeURIComponent(blade.name)}`} className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-neutral-300 transition hover:border-orange-400/50 hover:text-white" aria-label={`Request a quote for ${blade.name}`}><FiArrowRight /></Link></div>
            </div>
          </article>
        ))}</div> : <div className="rounded-3xl border border-orange-400/20 bg-orange-500/5 p-12 text-center"><FiZap className="mx-auto mb-4 text-orange-400" size={32} /><h2 className="text-2xl font-black uppercase">Signature catalog is updating</h2><p className="mt-3 text-sm text-neutral-400">The latest Zoho product data is syncing. Call (480) 470-2577 for immediate blade specifications.</p></div>}
      </section>
      <section className="relative z-10 border-y border-white/10 bg-white/[.025] px-4 py-20 text-center"><FiCheck className="mx-auto mb-5 text-orange-400" size={28} /><h2 className="text-3xl font-black uppercase tracking-tight sm:text-5xl">Built for the cut that matters</h2><p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-neutral-400">Tell our team the saw, material, aggregate, depth, and production target. We’ll match the right bond and configuration.</p><Link href="/contact" className="signature-primary mt-8 inline-flex items-center gap-2 rounded-xl px-7 py-4 text-xs font-black uppercase tracking-wider">Build my blade setup <FiArrowRight /></Link></section>
    </div>
  );
}

function Detail({ label, values }: { label: string; values: string[] }) { return <div className="flex gap-3"><span className="w-20 shrink-0 font-mono uppercase tracking-wider text-neutral-600">{label}</span><span>{values.join(' · ')}</span></div>; }
