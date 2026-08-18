"use client";

import { useState } from 'react';
import Link from 'next/link';
import { FiCheckCircle, FiRefreshCw, FiLock, FiArrowRight, FiZap, FiLayers, FiTruck } from 'react-icons/fi';

type Recommendation = {
  sku: string;
  name: string;
  category: string;
  image: string;
  reason: string;
  maxRpm: string;
  segmentHeight: string;
  wetDry: string;
};

const MATERIALS = [
  { id: "concrete-rebar", label: "Cured & Reinforced Concrete (Heavy Rebar)", desc: "Hard aggregates, steel rebar, wire mesh" },
  { id: "green-concrete", label: "Green Concrete / Control Joints", desc: "Abrasive uncured slab, soft aggregates" },
  { id: "asphalt", label: "Asphalt over Concrete / Overlay", desc: "Highly abrasive aggregate, sand, gravel" },
  { id: "brick-paver", label: "Brick, Pavers & Hard Masonry", desc: "Clay brick, interlocking pavers, block" },
  { id: "tile-granite", label: "Porcelain Tile, Granite & Marble", desc: "Chip-free delicate stone & porcelain" },
  { id: "steel-iron", label: "Structural Steel, Rebar & Metal", desc: "Vacuum-brazed metal demolition" },
];

const EQUIPMENT = [
  { id: "gas-saw", label: "Handheld Gas Cut-Off Saw (Stihl, Husqvarna)", diameter: '14" - 16"' },
  { id: "flat-saw", label: "Walk-Behind Flat Saw (13HP to 100HP)", diameter: '14" - 36"' },
  { id: "masonry-saw", label: "Electric Masonry / Tile Saw", diameter: '7" - 14"' },
  { id: "angle-grinder", label: "Angle Grinder (4.5\" / 7\" / 9\")", diameter: '4" - 9"' },
  { id: "core-drill", label: "Concrete Core Drilling Rig", diameter: '1" - 14"' },
];

const CUT_MODES = [
  { id: "wet", label: "Wet Cutting (Water Slurry Supression)" },
  { id: "dry", label: "Dry Cutting (Vacuum / Dry Dust Extraction)" },
  { id: "both", label: "Wet or Dry Versatility" },
];

export function BladeFinderClient() {
  const [selectedMaterial, setSelectedMaterial] = useState(MATERIALS[0].id);
  const [selectedEquipment, setSelectedEquipment] = useState(EQUIPMENT[0].id);
  const [selectedCutMode, setSelectedCutMode] = useState(CUT_MODES[0].id);
  const [calculated, setCalculated] = useState(false);

  const getRecommendations = (): Recommendation[] => {
    if (selectedMaterial === 'steel-iron') {
      return [
        {
          sku: "DXA2730P",
          name: 'DIAMONDX™ Vacuum Brazed Demolition Blade 14"',
          category: "DIAMONDX™",
          image: "/product-images/DXA2730P.png",
          reason: "Vacuum brazed diamonds fuse directly to steel core for zero segment loss on rebar and structural steel.",
          maxRpm: "5,400 RPM",
          segmentHeight: "Continuous Vacuum Brazed",
          wetDry: "Dry or Wet"
        },
        {
          sku: "DXA0125P",
          name: 'DIAMONDX™ All-Cut Metal & Concrete Wheel 4.5"',
          category: "DIAMONDX™",
          image: "/product-images/DXA0125P.png",
          reason: "Ultra high-speed metal cutter for angle grinders.",
          maxRpm: "13,300 RPM",
          segmentHeight: "Brazed Diamond Rim",
          wetDry: "Dry Only"
        }
      ];
    }

    if (selectedMaterial === 'green-concrete' || selectedMaterial === 'asphalt') {
      return [
        {
          sku: "SMX50H",
          name: 'SMX50 Hard-Bond Asphalt & Green Concrete Blade 14"',
          category: "Professional Blades",
          image: "/product-images/SMX50H.jpg",
          reason: "Hardened bond matrix prevents premature segment wear against abrasive sand and green concrete slurry.",
          maxRpm: "5,460 RPM",
          segmentHeight: "12mm Deep Segment",
          wetDry: "Wet or Dry"
        },
        {
          sku: "ZSRX50UT",
          name: 'ZENESIS™ ZSRX50 Abrasive Material Blade 16"',
          category: "ZENESIS™",
          image: "/product-images/ZSRX50UT.jpg",
          reason: "Patterned 3D diamond placement yields maximum footage in soft abrasive stone.",
          maxRpm: "4,700 RPM",
          segmentHeight: "15mm Patterned Segment",
          wetDry: "Wet Recommended"
        }
      ];
    }

    if (selectedMaterial === 'tile-granite') {
      return [
        {
          sku: "CRM",
          name: 'Titan Continuous Rim Porcelain & Granite Blade 10"',
          category: "Tile Blades",
          image: "/product-images/CRM.png",
          reason: "Ultra-thin continuous rim produces smooth glass-like cuts without chipping delicate porcelain glaze.",
          maxRpm: "6,100 RPM",
          segmentHeight: "8mm Continuous Rim",
          wetDry: "Wet Only"
        },
        {
          sku: "CRG(B)",
          name: 'Titan Turbo Tile & Natural Stone Blade 7"',
          category: "Turbo Blades",
          image: "/product-images/CRG(B).png",
          reason: "Cooling holes reduce thermal expansion during fast dry tile trimming.",
          maxRpm: "8,500 RPM",
          segmentHeight: "10mm Turbo Rim",
          wetDry: "Dry or Wet"
        }
      ];
    }

    if (selectedEquipment === 'core-drill') {
      return [
        {
          sku: "CD30M",
          name: 'Titan Master Premium Concrete Core Bit 4" x 14"',
          category: "Core Bits",
          image: "/product-images/CD30M.jpg",
          reason: "Roof-top segment design ensures immediate bit tracking through 5000 PSI concrete and Grade 60 rebar.",
          maxRpm: "900 RPM",
          segmentHeight: "10mm Crown Segment",
          wetDry: "Wet Operation"
        }
      ];
    }

    // Default Concrete Rebar
    return [
      {
        sku: "SMX10LV",
        name: 'SMX10 Ultra-Speed Concrete & Rebar Blade 14"',
        category: "Professional Blades",
        image: "/product-images/SMX10LV.png",
        reason: "Soft matrix bond sheds worn diamonds quickly to slice through hard 6000+ PSI aggregate and thick rebar.",
        maxRpm: "5,460 RPM",
        segmentHeight: "12mm Laser Welded",
        wetDry: "Wet or Dry"
      },
      {
        sku: "ZSRX30UT",
        name: 'ZENESIS™ ZSRX30 Patterned Concrete Blade 16"',
        category: "ZENESIS™",
        image: "/product-images/ZSRX30UT.jpg",
        reason: "3D grid aligned diamonds cut 50% faster with 30% less saw motor drag.",
        maxRpm: "4,700 RPM",
        segmentHeight: "15mm Patterned Segment",
        wetDry: "Wet or Dry"
      }
    ];
  };

  const recs = getRecommendations();

  return (
    <div className="space-y-8">
      {/* Wizard Steps */}
      <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="space-y-6">
          
          {/* Step 1: Material */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-amber-400 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400 text-xs">1</span>
              Select Material Being Cut:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {MATERIALS.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMaterial(m.id)}
                  className={`p-3.5 rounded-2xl text-left border transition-all ${
                    selectedMaterial === m.id
                      ? 'bg-amber-500/15 border-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                      : 'bg-neutral-950 border-white/5 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  <div className="text-xs font-bold text-white mb-0.5">{m.label}</div>
                  <div className="text-[10px] text-neutral-500">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Equipment */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-amber-400 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400 text-xs">2</span>
              Select Saw Equipment:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {EQUIPMENT.map(e => (
                <button
                  key={e.id}
                  onClick={() => setSelectedEquipment(e.id)}
                  className={`p-3.5 rounded-2xl text-left border transition-all ${
                    selectedEquipment === e.id
                      ? 'bg-amber-500/15 border-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                      : 'bg-neutral-950 border-white/5 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  <div className="text-xs font-bold text-white mb-0.5">{e.label}</div>
                  <div className="text-[10px] text-amber-400 font-mono">Typical Size: {e.diameter}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Cut Mode */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-amber-400 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400 text-xs">3</span>
              Select Cut Mode:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {CUT_MODES.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCutMode(c.id)}
                  className={`p-3 rounded-2xl text-center text-xs font-bold border transition-all ${
                    selectedCutMode === c.id
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-neutral-950 border-white/5 text-neutral-400 hover:border-white/20'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Output Recommendations */}
      <div className="bg-neutral-900/60 border border-amber-500/30 rounded-3xl p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
          <div>
            <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest block">MATCHED SPECIFICATION</span>
            <h3 className="text-xl font-black text-white uppercase">RECOMMENDED TITAN DIAMOND TOOLING</h3>
          </div>
          <span className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-1 rounded-full font-bold">
            {recs.length} Spec Matches
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {recs.map((item, idx) => (
            <div key={idx} className="bg-neutral-950 border border-white/10 rounded-2xl p-6 flex flex-col justify-between hover:border-amber-500/40 transition-all">
              <div>
                <div className="h-44 bg-neutral-900 rounded-xl flex items-center justify-center p-4 mb-4 border border-white/5">
                  <img src={item.image} alt={item.name} className="max-h-full max-w-full object-contain filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]" />
                </div>
                
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                  {item.category}
                </span>
                
                <h4 className="text-base font-bold text-white mt-2 mb-1">{item.name}</h4>
                <div className="text-xs font-mono text-neutral-500 mb-3">SKU: {item.sku}</div>
                
                <p className="text-xs text-neutral-300 leading-relaxed mb-4 bg-neutral-900 p-3 rounded-xl border border-white/5">
                  <strong className="text-amber-400 block mb-1">Why This Blade:</strong>
                  {item.reason}
                </p>

                <div className="grid grid-cols-3 gap-2 text-[10px] text-neutral-400 bg-neutral-900 p-2.5 rounded-xl border border-white/5 mb-6 text-center font-mono">
                  <div><span className="block text-neutral-600 uppercase">Max RPM</span>{item.maxRpm}</div>
                  <div><span className="block text-neutral-600 uppercase">Segment</span>{item.segmentHeight}</div>
                  <div><span className="block text-neutral-600 uppercase">Mode</span>{item.wetDry}</div>
                </div>
              </div>

              <div className="flex gap-3">
                <Link 
                  href={`/shop?category=${encodeURIComponent(item.category)}`}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold py-3 px-4 rounded-xl text-center text-xs transition-all shadow-md flex items-center justify-center gap-2"
                >
                  View in Catalog <FiArrowRight />
                </Link>
                <Link 
                  href="/login"
                  className="bg-neutral-900 hover:bg-neutral-800 text-white font-bold py-3 px-4 rounded-xl text-xs border border-white/10 transition-colors flex items-center justify-center gap-1.5"
                >
                  <FiLock className="text-amber-400" /> Rates
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
