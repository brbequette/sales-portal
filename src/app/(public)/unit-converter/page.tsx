"use client";

import { useState } from 'react';
import Link from 'next/link';
import { FiRefreshCw, FiZap, FiCheckCircle } from 'react-icons/fi';
import { SparkCanvas } from '@/components/SparkCanvas';

export default function UnitConverterPage() {
  const [value, setValue] = useState<number>(12);
  const [conversionType, setConversionType] = useState<'mmToInches' | 'inchesToMm' | 'hpToKw' | 'rpmToSfpm'>('mmToInches');

  const convert = () => {
    switch (conversionType) {
      case 'mmToInches':
        return { result: (value * 0.0393701).toFixed(3), unit: 'Inches', formula: '1mm = 0.03937 Inches' };
      case 'inchesToMm':
        return { result: (value * 25.4).toFixed(1), unit: 'Millimeters (mm)', formula: '1 Inch = 25.4 mm' };
      case 'hpToKw':
        return { result: (value * 0.7457).toFixed(2), unit: 'Kilowatts (kW)', formula: '1 HP = 0.7457 kW' };
      case 'rpmToSfpm':
        // Assume 14" blade standard
        return { result: Math.round((value * 14 * Math.PI) / 12).toLocaleString(), unit: 'SFPM (for 14" Blade)', formula: 'SFPM = (RPM × Dia × π) / 12' };
      default:
        return { result: '0', unit: '', formula: '' };
    }
  };

  const output = convert();

  return (
    <div className="bg-neutral-950 text-white min-h-screen relative overflow-hidden">
      <SparkCanvas />

      <section className="py-16 bg-gradient-to-b from-neutral-900/90 via-neutral-950 to-neutral-950 border-b border-white/10 text-center relative z-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-4 py-1.5 rounded-full mb-4">
            <FiRefreshCw className="text-amber-400" size={16} />
            <span className="text-xs font-black uppercase tracking-widest text-amber-300">
              JOBSITE SPEC CONVERTER
            </span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight mb-4 text-white">
            SEGMENT & UNIT CONVERTER
          </h1>
          <p className="text-neutral-300 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            Convert segment height (mm to inches), saw horsepower to kW, and blade arbor dimensions instantly.
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-12 relative z-10">
        <div className="bg-neutral-900/90 backdrop-blur-xl border border-amber-500/40 rounded-3xl p-8 sm:p-12 shadow-[0_0_60px_rgba(245,158,11,0.15)] space-y-8">
          {/* Conversion Selector */}
          <div>
            <label className="text-xs font-mono font-bold text-neutral-400 block mb-2 uppercase">SELECT CONVERSION TYPE:</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: 'mmToInches', label: 'mm → Inches' },
                { id: 'inchesToMm', label: 'Inches → mm' },
                { id: 'hpToKw', label: 'HP → kW' },
                { id: 'rpmToSfpm', label: 'RPM → SFPM' },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setConversionType(c.id as any)}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all text-center ${
                    conversionType === c.id 
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300' 
                      : 'bg-neutral-950 border-white/10 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div>
            <label className="text-xs font-mono font-bold text-neutral-400 block mb-2 uppercase">INPUT VALUE:</label>
            <input 
              type="number"
              value={value}
              onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
              className="w-full bg-neutral-950 border border-white/10 rounded-2xl py-4 px-6 text-xl font-mono font-bold text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Output Display */}
          <div className="bg-neutral-950 p-8 rounded-2xl border border-amber-500/30 text-center space-y-2">
            <span className="text-xs font-mono font-bold text-neutral-500 uppercase tracking-widest">CONVERTED RESULT</span>
            <div className="text-5xl font-black text-amber-400 font-mono">
              {output.result} <span className="text-lg font-bold text-white">{output.unit}</span>
            </div>
            <div className="text-[11px] font-mono text-neutral-400 pt-2 border-t border-white/5">
              Formula: {output.formula}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
