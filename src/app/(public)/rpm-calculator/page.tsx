"use client";

import { useState } from 'react';
import Link from 'next/link';
import { FiSliders, FiZap, FiCheckCircle, FiAlertTriangle, FiArrowRight } from 'react-icons/fi';
import { SparkCanvas } from '@/components/SparkCanvas';

export default function RpmCalculatorPage() {
  const [diameter, setDiameter] = useState<number>(14);
  const [material, setMaterial] = useState<'concrete' | 'asphalt' | 'stone' | 'metal'>('concrete');

  // Calculate SFPM (Surface Feet Per Minute) = (RPM * Diameter * PI) / 12
  // Optimal SFPM ranges:
  // Concrete: 9,500 - 11,500 SFPM
  // Asphalt: 10,500 - 13,000 SFPM
  // Natural Stone / Tile: 6,000 - 8,000 SFPM
  // Metal / Rebar: 11,000 - 14,000 SFPM

  const getTargetSfpm = () => {
    switch (material) {
      case 'asphalt': return { min: 10500, max: 13000, target: 11500 };
      case 'stone': return { min: 6000, max: 8000, target: 7000 };
      case 'metal': return { min: 11000, max: 14000, target: 12500 };
      default: return { min: 9500, max: 11500, target: 10500 };
    }
  };

  const sfpmInfo = getTargetSfpm();
  const targetRpm = Math.round((sfpmInfo.target * 12) / (Math.PI * diameter));
  const minRpm = Math.round((sfpmInfo.min * 12) / (Math.PI * diameter));
  const maxRpm = Math.round((sfpmInfo.max * 12) / (Math.PI * diameter));

  return (
    <div className="bg-neutral-950 text-white min-h-screen relative overflow-hidden">
      <SparkCanvas />

      <section className="py-16 bg-gradient-to-b from-neutral-900/90 via-neutral-950 to-neutral-950 border-b border-white/10 text-center relative z-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-4 py-1.5 rounded-full mb-4">
            <FiSliders className="text-amber-400" size={16} />
            <span className="text-xs font-black uppercase tracking-widest text-amber-300">
              JOBSITE TOOL CALCULATOR
            </span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight mb-4 text-white">
            SAW BLADE RPM CALCULATOR
          </h1>
          <p className="text-neutral-300 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            Calculate the exact operating RPM and Surface Feet Per Minute (SFPM) for your saw to maximize diamond segment footage life and cut speed.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 py-12 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Inputs */}
          <div className="bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-6">
            <h2 className="text-xl font-black uppercase text-white mb-4">1. Select Blade Diameter & Material</h2>

            <div>
              <label className="text-xs font-mono font-bold text-neutral-400 block mb-2">BLADE DIAMETER (INCHES): {diameter}"</label>
              <input 
                type="range" 
                min="4" 
                max="36" 
                step="1"
                value={diameter}
                onChange={(e) => setDiameter(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-neutral-500 mt-1">
                <span>4" (Grinder)</span>
                <span>14" (Handheld)</span>
                <span>24" (Flat Saw)</span>
                <span>36" (Wall Saw)</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-mono font-bold text-neutral-400 block mb-2">CUTTING MATERIAL:</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'concrete', label: 'Cured Concrete' },
                  { id: 'asphalt', label: 'Asphalt / Green Concrete' },
                  { id: 'stone', label: 'Granite & Tile' },
                  { id: 'metal', label: 'Steel & Rebar' }
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMaterial(m.id as any)}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all text-left ${
                      material === m.id 
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300' 
                        : 'bg-neutral-950 border-white/10 text-neutral-400 hover:border-white/20'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Output */}
          <div className="bg-neutral-900/90 backdrop-blur-xl border border-amber-500/40 rounded-3xl p-8 flex flex-col justify-between shadow-[0_0_50px_rgba(245,158,11,0.15)]">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 block mb-1">RECOMMENDED OPERATING SPEED</span>
              <h3 className="text-5xl font-black text-white mb-2">{targetRpm.toLocaleString()} <span className="text-xl font-bold text-amber-400">RPM</span></h3>
              <p className="text-xs text-neutral-400 mb-6">Safe operating range: <strong className="text-white">{minRpm.toLocaleString()} RPM — {maxRpm.toLocaleString()} RPM</strong></p>

              <div className="bg-neutral-950 p-4 rounded-2xl border border-white/5 space-y-2 text-xs font-mono text-neutral-300 mb-6">
                <div className="flex justify-between">
                  <span className="text-neutral-500">TARGET SFPM:</span>
                  <span className="text-amber-400 font-bold">{sfpmInfo.target.toLocaleString()} SFPM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">BLADE DIAMETER:</span>
                  <span className="text-white font-bold">{diameter} Inches</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">OPTIMAL WATER FLOW:</span>
                  <span className="text-white font-bold">{diameter >= 18 ? '2.5 - 4.0 GPM' : '1.5 - 2.5 GPM'}</span>
                </div>
              </div>
            </div>

            <Link 
              href="/blade-finder"
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider py-3.5 rounded-xl text-center block shadow-lg"
            >
              Launch Interactive Spec Finder →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
