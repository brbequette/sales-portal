"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiArrowRight, FiCheck, FiInfo, FiPhone, FiX } from 'react-icons/fi';

type BladeStory = { name: string; sku: string; sizes: string; image: string; intro: string; details: string[] };
const BLADES: BladeStory[] = [
  { name: 'The Dragon', sku: 'SMX50EV Series', sizes: '14 · 16 · 18 · 20 in.', image: '/product-images/cutouts-v2/dragon-formatted.png', intro: 'A four-size Signature family engineered to balance fast cutting, usable segment life, and steady production across multiple saw setups.', details: ['Current catalog variants span 14 through 20 inches.', 'Choose the exact variant by saw arbor, horsepower, material and cut depth.', 'Use wet cutting whenever the selected saw and job specification allow it.'] },
  { name: 'The Medusa', sku: 'IF30PVR Series', sizes: '12 · 14 in. + 20 mm arbor', image: '/product-images/cutouts-v2/medusa-formatted.png', intro: 'Compact Signature configurations with multiple fitment choices for crews that need precise saw compatibility.', details: ['Cataloged in 12-inch and 14-inch configurations.', 'A 20 mm arbor variant is available in the current product family.', 'Confirm arbor and flange requirements before ordering.'] },
  { name: 'The Zeus', sku: 'SMX50VT1412E', sizes: '14 in.', image: '/product-images/cutouts-v2/zeus-formatted.png', intro: 'A focused 14-inch Signature configuration built for efficient cutting and dependable service life when correctly matched to the material.', details: ['Current catalog record: SMX50VT1412E.', 'Match the bond to aggregate hardness and abrasiveness.', 'Confirm saw RPM is within the blade’s marked maximum.'] },
  { name: 'The Barbarian', sku: 'IF30PV1412E', sizes: 'Current catalog configuration', image: '/product-images/cutouts-v2/barbarian-formatted.png', intro: 'A production-focused Signature blade intended to reduce blade changes and keep qualified saws cutting efficiently.', details: ['Current catalog record: IF30PV1412E.', 'Tell Titan whether the cut is wet or dry and whether rebar is expected.', 'For production estimates, include target depth and daily linear footage.'] },
];

export function SignatureBladeShowcase() {
  const [selected, setSelected] = useState<BladeStory | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setSelected(null);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); };
  }, [selected]);
  return <section className="signature-showcase" aria-labelledby="signature-showcase-heading">
    <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"><div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
      <div><span className="public-kicker">Titan Signature Series</span><h2 id="signature-showcase-heading" className="mt-5 text-4xl font-black uppercase leading-[.92] tracking-[-.045em] sm:text-6xl">Cut faster.<br /><span className="text-orange-400">Change less.</span></h2><p className="mt-5 max-w-lg text-sm leading-7 text-neutral-400">Signature Series families are built around the metrics that matter on a job: cutting speed, usable life, saw compatibility, material, aggregate, reinforcement, and production targets.</p><Link href="/signature-series" className="public-inline-link mt-7">Explore all 12 families <FiArrowRight /></Link></div>
      <div className="grid gap-4 sm:grid-cols-2">{BLADES.map((blade) => <article key={blade.name} className="signature-teaser"><div className="signature-teaser-image"><Image src={blade.image} alt={`${blade.name} Signature Series diamond blade`} width={420} height={420} className="h-full w-full object-contain" /></div><div className="min-w-0"><p>{blade.sku}</p><h3>{blade.name}</h3><span>{blade.sizes}</span><button type="button" onClick={() => setSelected(blade)}>Read more <FiArrowRight /></button></div></article>)}</div>
    </div></div>
    {mounted && selected && createPortal(<BladeDrawer blade={selected} onClose={() => setSelected(null)} />, document.body)}
  </section>;
}

function BladeDrawer({ blade, onClose }: { blade: BladeStory; onClose: () => void }) {
  return <div className="signature-drawer-root" role="dialog" aria-modal="true" aria-labelledby="signature-drawer-title"><button className="signature-drawer-backdrop" onClick={onClose} aria-label="Close blade details" /><aside className="signature-drawer-panel"><button className="signature-drawer-close" onClick={onClose} aria-label="Close blade details"><FiX /><span>Close</span></button><div className="signature-drawer-art"><Image src={blade.image} alt={`${blade.name} diamond blade`} width={700} height={700} className="h-full w-full object-contain" /></div><div className="p-6 sm:p-9"><p className="font-mono text-[10px] font-black uppercase tracking-[.2em] text-orange-400">{blade.sku}</p><h2 id="signature-drawer-title" className="mt-2 text-4xl font-black uppercase tracking-tight sm:text-5xl">{blade.name}</h2><p className="mt-5 text-sm leading-7 text-neutral-300">{blade.intro}</p><div className="mt-7 rounded-xl border border-orange-400/20 bg-orange-500/5 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Current size range</p><p className="mt-1 text-lg font-black text-white">{blade.sizes}</p></div><h3 className="mt-8 flex items-center gap-2 text-xs font-black uppercase tracking-widest"><FiInfo className="text-orange-400" /> Before you order</h3><ul className="mt-4 space-y-3">{blade.details.map((detail) => <li key={detail} className="flex gap-3 text-sm leading-6 text-neutral-400"><FiCheck className="mt-1 shrink-0 text-orange-400" />{detail}</li>)}</ul><div className="mt-9 grid gap-3 sm:grid-cols-2"><Link href="/signature-series" onClick={onClose} className="public-cta-secondary">Full specifications</Link><a href="tel:14804702577" className="public-cta-primary"><FiPhone /> Ask a diamond tech</a></div></div></aside></div>;
}
