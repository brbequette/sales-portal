"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';

export type FeaturedSignature = { family:string; image:string; description:string; skus:string[]; sizes:string[]; applications:string[]; equipment:string[]; materials:string[]; variants:number };

export function FeaturedSignatureCarousel({ blades }: { blades: FeaturedSignature[] }) {
  const [page, setPage] = useState(0);
  const pages = [blades.slice(0, 6), blades.slice(6, 12)].filter(items => items.length);
  const shown = pages[page] || pages[0] || [];
  return <div className="signature-carousel">
    <div className="featured-tool-grid" aria-live="polite">{shown.map((blade, idx) => <Link key={blade.family} href="/signature-series" className={`featured-tool-card featured-tool-card--${idx + 1} group`}>
      <div className="featured-tool-art"><div className="featured-tool-orbit" /><span className="absolute left-4 top-4 z-20 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-amber-400">{blade.variants} {blade.variants === 1 ? 'configuration' : 'configurations'}</span><Image src={blade.image} alt={`${blade.family} Signature Series diamond blade`} width={400} height={400} className="featured-tool-image" /></div>
      <div className="featured-tool-copy"><div><h3 className="mb-2 text-xl font-black uppercase tracking-tight text-white transition-colors group-hover:text-amber-400">{blade.family}</h3><p className="featured-signature-description text-xs leading-relaxed text-neutral-400">{blade.description}</p><div className="featured-signature-attributes">{blade.sizes.length > 0 && <span><b>Sizes</b>{blade.sizes.slice(0,3).join(' · ')}</span>}{blade.applications.length > 0 && <span><b>Application</b>{blade.applications.slice(0,2).join(' · ')}</span>}{blade.materials.length > 0 && <span><b>Materials</b>{blade.materials.slice(0,2).join(' · ')}</span>}{blade.equipment.length > 0 && <span><b>Saw fit</b>{blade.equipment.slice(0,2).join(' · ')}</span>}<span><b>Current SKUs</b>{blade.skus.slice(0,3).join(' · ')}</span></div></div><div className="flex items-center gap-2 border-t border-white/5 pt-4 text-xs font-bold text-amber-400">See Family Details <FiArrowRight /></div></div>
    </Link>)}</div>
    {pages.length > 1 && <div className="signature-carousel-controls"><button type="button" onClick={() => setPage((page - 1 + pages.length) % pages.length)} aria-label="Show previous six Signature blades"><FiArrowLeft /> Previous six</button><div className="signature-carousel-dots" aria-label={`Signature group ${page + 1} of ${pages.length}`}>{pages.map((_, index) => <button key={index} type="button" className={index === page ? 'is-active' : ''} onClick={() => setPage(index)} aria-label={`Show Signature blade group ${index + 1}`} />)}</div><button type="button" onClick={() => setPage((page + 1) % pages.length)}>Next six <FiArrowRight /></button></div>}
  </div>;
}
