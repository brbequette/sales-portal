"use client";

import { useState } from 'react';
import Link from 'next/link';
import { FiLayers, FiCheck, FiZap, FiArrowRight } from 'react-icons/fi';
import { SparkCanvas } from '@/components/SparkCanvas';

const COMPARATOR_DATA = [
  {
    sku: "ZSRX30UT",
    name: "ZENESIS™ 3D Patterned Blade",
    category: "Concrete & Heavy Rebar",
    cutSpeed: 95,
    footageLife: 92,
    rebarResistance: 98,
    segmentHeight: "15mm 3D Grid",
    segmentBond: "Equidistant Patterned Grid",
    image: "/product-images/ZSRX30UT.jpg"
  },
  {
    sku: "SMX10LV",
    name: "SMX Ultra-Pro Concrete Blade",
    category: "Hard Aggregates",
    cutSpeed: 88,
    footageLife: 96,
    rebarResistance: 90,
    segmentHeight: "12mm Keyhole",
    segmentBond: "Soft Bond Matrix",
    image: "/product-images/SMX10LV.png"
  },
  {
    sku: "DXA2730P",
    name: "DIAMONDX™ Demolition All-Cut",
    category: "Steel, Metal & Rebar",
    cutSpeed: 90,
    footageLife: 85,
    rebarResistance: 100,
    segmentHeight: "Vacuum Brazed",
    segmentBond: "Brazed Steel Core",
    image: "/product-images/DXA2730P.png"
  },
  {
    sku: "CD30M",
    name: "CD30 Master Core Bit",
    category: "Concrete Core Drilling",
    cutSpeed: 92,
    footageLife: 90,
    rebarResistance: 94,
    segmentHeight: "Rooftop Crown",
    segmentBond: "Wet Slurry Crown",
    image: "/product-images/CD30M.jpg"
  }
];

export default function BladeComparatorPage() {
  const [blade1, setBlade1] = useState(COMPARATOR_DATA[0]);
  const [blade2, setBlade2] = useState(COMPARATOR_DATA[1]);

  return (
    <div className="bg-neutral-950 text-white min-h-screen relative overflow-hidden">
      <SparkCanvas />

      <section className="py-16 bg-gradient-to-b from-neutral-900/90 via-neutral-950 to-neutral-950 border-b border-white/10 text-center relative z-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-4 py-1.5 rounded-full mb-4">
            <FiLayers className="text-amber-400" size={16} />
            <span className="text-xs font-black uppercase tracking-widest text-amber-300">
              SIDE-BY-SIDE SPEC COMPARATOR
            </span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight mb-4 text-white">
            DIAMOND BLADE COMPARATOR
          </h1>
          <p className="text-neutral-300 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            Compare cut speeds, footage life, segment height, and rebar penetration performance side-by-side.
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-12 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Blade 1 */}
          <div className="bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-6">
            <label className="text-xs font-mono font-bold text-neutral-400 block uppercase">SELECT FIRST BLADE:</label>
            <select
              value={blade1.sku}
              onChange={(e) => setBlade1(COMPARATOR_DATA.find(b => b.sku === e.target.value) || COMPARATOR_DATA[0])}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              {COMPARATOR_DATA.map(b => (
                <option key={b.sku} value={b.sku}>{b.name} ({b.sku})</option>
              ))}
            </select>

            <div className="h-56 bg-neutral-950 rounded-2xl flex items-center justify-center p-4 border border-white/5">
              <img src={blade1.image} alt={blade1.name} className="max-h-full object-contain filter drop-shadow-lg" />
            </div>

            <h3 className="text-2xl font-black text-white">{blade1.name}</h3>
            <span className="text-xs font-mono text-amber-400 font-bold">{blade1.category}</span>

            <div className="space-y-4 pt-4 border-t border-white/10 text-xs">
              <div>
                <div className="flex justify-between font-mono mb-1">
                  <span>CUT SPEED:</span>
                  <span className="text-amber-400 font-bold">{blade1.cutSpeed}%</span>
                </div>
                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full" style={{ width: `${blade1.cutSpeed}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between font-mono mb-1">
                  <span>FOOTAGE LIFE:</span>
                  <span className="text-amber-400 font-bold">{blade1.footageLife}%</span>
                </div>
                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full" style={{ width: `${blade1.footageLife}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between font-mono mb-1">
                  <span>REBAR PENETRATION:</span>
                  <span className="text-amber-400 font-bold">{blade1.rebarResistance}%</span>
                </div>
                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full" style={{ width: `${blade1.rebarResistance}%` }} />
                </div>
              </div>

              <div className="bg-neutral-950 p-3.5 rounded-xl border border-white/5 font-mono text-neutral-300">
                <div><strong className="text-neutral-500">SEGMENT HEIGHT:</strong> {blade1.segmentHeight}</div>
                <div><strong className="text-neutral-500">BOND TYPE:</strong> {blade1.segmentBond}</div>
              </div>
            </div>
          </div>

          {/* Blade 2 */}
          <div className="bg-neutral-900/90 backdrop-blur-xl border border-amber-500/40 rounded-3xl p-8 space-y-6 shadow-[0_0_50px_rgba(245,158,11,0.15)]">
            <label className="text-xs font-mono font-bold text-neutral-400 block uppercase">SELECT SECOND BLADE:</label>
            <select
              value={blade2.sku}
              onChange={(e) => setBlade2(COMPARATOR_DATA.find(b => b.sku === e.target.value) || COMPARATOR_DATA[1])}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              {COMPARATOR_DATA.map(b => (
                <option key={b.sku} value={b.sku}>{b.name} ({b.sku})</option>
              ))}
            </select>

            <div className="h-56 bg-neutral-950 rounded-2xl flex items-center justify-center p-4 border border-white/5">
              <img src={blade2.image} alt={blade2.name} className="max-h-full object-contain filter drop-shadow-lg" />
            </div>

            <h3 className="text-2xl font-black text-white">{blade2.name}</h3>
            <span className="text-xs font-mono text-amber-400 font-bold">{blade2.category}</span>

            <div className="space-y-4 pt-4 border-t border-white/10 text-xs">
              <div>
                <div className="flex justify-between font-mono mb-1">
                  <span>CUT SPEED:</span>
                  <span className="text-amber-400 font-bold">{blade2.cutSpeed}%</span>
                </div>
                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full" style={{ width: `${blade2.cutSpeed}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between font-mono mb-1">
                  <span>FOOTAGE LIFE:</span>
                  <span className="text-amber-400 font-bold">{blade2.footageLife}%</span>
                </div>
                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full" style={{ width: `${blade2.footageLife}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between font-mono mb-1">
                  <span>REBAR PENETRATION:</span>
                  <span className="text-amber-400 font-bold">{blade2.rebarResistance}%</span>
                </div>
                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full" style={{ width: `${blade2.rebarResistance}%` }} />
                </div>
              </div>

              <div className="bg-neutral-950 p-3.5 rounded-xl border border-white/5 font-mono text-neutral-300">
                <div><strong className="text-neutral-500">SEGMENT HEIGHT:</strong> {blade2.segmentHeight}</div>
                <div><strong className="text-neutral-500">BOND TYPE:</strong> {blade2.segmentBond}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
