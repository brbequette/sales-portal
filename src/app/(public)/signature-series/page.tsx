import Link from 'next/link';
import { Metadata } from 'next';
import { FiZap, FiShield, FiLock, FiArrowRight, FiStar, FiCheckCircle } from 'react-icons/fi';
import { SparkCanvas } from '@/components/SparkCanvas';

export const metadata: Metadata = {
  title: 'Titan Signature Warrior Series Blades | Titan Diamond USA',
  description: 'The legendary Titan Signature Warrior Series - high-art custom graphic circular diamond saw blades engineered for extreme concrete, asphalt, rebar, and demolition cutting.',
};

const ALL_SIGNATURE_BLADES = [
  {
    id: "dragon",
    name: "THE DRAGON",
    subtitle: "Premium Asphalt & Green Concrete Undercut Blade",
    image: "/images/signature/dragon.jpg",
    specs: '14" x .125" x 1" Arbor | 12mm Segments + 14mm Drop Segment',
    material: "Asphalt over Concrete, Green Concrete, Soft Aggregates",
    retailPrice: "$229.99",
    contractorOffer: "BUY 3 @ $179.99 EACH & GET 1 FREE",
    description: "Features deep 14mm drop segments to shield the core weld line against abrasive sand slurry erosion.",
    tag: "SIGNATURE BESTSELLER"
  },
  {
    id: "zeus",
    name: "ZEUS",
    subtitle: "Thunderbolt Concrete & Heavy Rebar Destroyer",
    image: "/images/signature/zeus.jpg",
    specs: '14" / 16" x .125" x 1" | 15mm Laser Welded Segment',
    material: "6000+ PSI Reinforced Concrete, Grade 60 Rebar, Hard River Rock",
    retailPrice: "$249.99",
    contractorOffer: "BUY 3 GET 1 FREE + FREE JOBSITE FREIGHT",
    description: "Thunderbolt diamond matrix formulation sheds worn diamond grit rapidly to slice through heavy rebar.",
    tag: "GOD OF THUNDER"
  },
  {
    id: "medusa",
    name: "THE MEDUSA",
    subtitle: "Hard Aggregates & Natural Stone Laser Blade",
    image: "/images/signature/medusa.jpg",
    specs: '12" / 14" x .110" x 1" | 12mm Segment Height',
    material: "Granite, Quartzite, Hard Brick, Flint Concrete",
    retailPrice: "$219.99",
    contractorOffer: "SPECIAL CONTRACTOR TIER RATES",
    description: "Snakeskin perimeter segment matrix engineered for zero-chip cutting on hard natural stone and quartzite.",
    tag: "CHIP-FREE CUTTING"
  },
  {
    id: "barbarian",
    name: "THE BARBARIAN",
    subtitle: "Extreme Berserker Heavy Slab Blade",
    image: "/images/signature/barbarian.jpg",
    specs: '14" / 18" / 20" x .125" | 15mm Segment',
    material: "Pre-stressed Concrete, Highway Paving, Bridge Decks",
    retailPrice: "$259.99",
    contractorOffer: "CONTRACTOR 4-BLADE DEAL",
    description: "Maximum diamond grit density built for high-horsepower flat saws on heavy commercial paving jobs.",
    tag: "HEAVY DEMOLITION"
  },
  {
    id: "dark-knight",
    name: "THE DARK KNIGHT",
    subtitle: "Structural Steel & Metal Demolition All-Cut",
    image: "/images/saw_blade.jpg",
    specs: '14" / 16" x .125" x 1" Arbor | Vacuum Brazed Segment',
    material: "Structural I-Beams, Rebar, Steel Pipe, Cast Iron, Ductile Iron",
    retailPrice: "$269.99",
    contractorOffer: "DEMOLITION CONTRACTOR SPECIAL",
    description: "Vacuum-brazed high-grade diamond segments engineered to cut metal, steel, and concrete in emergency rescue.",
    tag: "STEEL & METAL ALL-CUT"
  },
  {
    id: "battle-axe",
    name: "BATTLE AXE",
    subtitle: "Rapid Slab & Expansion Joint Cutter",
    image: "/images/saw_blade.jpg",
    specs: '14" x .125" x 1" | 12mm Keyhole Gullet Segment',
    material: "Cured Slab Concrete, Brick, Block, Pavers",
    retailPrice: "$209.99",
    contractorOffer: "BUY 5 GET 1 FREE",
    description: "Keyhole gullet core design evacuates slurry at high RPM for high speed flat saw cuts.",
    tag: "FAST SLAB CUTTER"
  },
  {
    id: "hades",
    name: "HOUNDS OF HADES",
    subtitle: "Thermal Heat Tolerant Deep Segment Core",
    image: "/images/saw_blade.jpg",
    specs: '14" / 16" x .125" | 3D Patterned Array',
    material: "Heavily Reinforced Slab, Hard River Aggregate",
    retailPrice: "$239.99",
    contractorOffer: "CONTRACTOR VOLUME DISCOUNT",
    description: "Equidistant 3D grid diamond alignment ensures lower operating heat and zero segment loss under heavy stress.",
    tag: "HEAT SHIELD CORE"
  },
  {
    id: "hydra",
    name: "THE HYDRA",
    subtitle: "Multi-Segment Universal Jobsite Blade",
    image: "/images/tuck_point.jpg",
    specs: '14" x .125" x 1" | Alternating Segment Bond',
    material: "Asphalt, Concrete, Masonry, Field Stone",
    retailPrice: "$219.99",
    contractorOffer: "MIX & MATCH CONTRACTOR PACK",
    description: "Alternating hard and soft segment bonds allow contractors to transition between concrete and asphalt on 1 blade.",
    tag: "MULTI-MATERIAL"
  }
];

export default function SignatureSeriesPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen relative overflow-hidden">
      {/* Background Spark Animation */}
      <SparkCanvas />

      {/* Ticker Marquee */}
      <div className="bg-amber-500 text-neutral-950 font-black text-xs uppercase tracking-widest py-2.5 overflow-hidden whitespace-nowrap border-b border-amber-400 relative z-10 shadow-md">
        <div className="inline-block animate-marquee">
          ⚡ TITAN SIGNATURE WARRIOR SERIES • HIGH-ART CUSTOM GRAPHIC CORES • 100% LASER WELDED DIAMOND SEGMENTS • CONTRACTOR BOGO INTRODUCTORY OFFERS • CALL SALES (800) 555-0199 ⚡
        </div>
      </div>

      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-neutral-900/90 via-neutral-950 to-neutral-950 border-b border-white/10 text-center relative z-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 px-5 py-2 rounded-full mb-6">
            <FiZap className="text-amber-400 animate-pulse" size={18} />
            <span className="text-xs font-black uppercase tracking-widest text-amber-300">
              COMMERCIAL-GRADE WARRIOR GRAPHIC BLADES
            </span>
          </div>
          
          <h1 className="text-5xl sm:text-7xl font-black uppercase tracking-tight mb-6 text-white leading-none">
            TITAN SIGNATURE BLADES
          </h1>
          <p className="text-neutral-300 text-sm sm:text-lg leading-relaxed max-w-3xl mx-auto">
            High-art custom graphic cores fused with commercial laser-welded diamond segments. Built for contractors who cut hard aggregate, rebar, and asphalt without compromise.
          </p>
        </div>
      </section>

      {/* Grid Showcase */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-10">
          {ALL_SIGNATURE_BLADES.map((blade) => (
            <div 
              key={blade.id}
              className="bg-neutral-900/80 backdrop-blur-xl border border-amber-500/30 rounded-3xl p-8 hover:border-amber-500/80 transition-all duration-500 shadow-[0_0_50px_rgba(245,158,11,0.1)] hover:shadow-[0_0_70px_rgba(245,158,11,0.25)] flex flex-col justify-between group transform hover:-translate-y-1"
            >
              <div>
                <div className="relative h-80 bg-gradient-to-b from-neutral-950 to-neutral-900 rounded-2xl flex items-center justify-center p-6 mb-6 border border-white/10 overflow-hidden group-hover:border-amber-500/50 transition-colors">
                  <img 
                    src={blade.image} 
                    alt={blade.name} 
                    className="max-h-full max-w-full object-contain filter drop-shadow-[0_20px_40px_rgba(0,0,0,0.9)] group-hover:scale-110 group-hover:rotate-3 transition-transform duration-700 ease-out" 
                  />
                  <div className="absolute top-4 left-4">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-amber-500 to-orange-600 text-neutral-950 font-bold px-3.5 py-1.5 rounded-full shadow-lg">
                      {blade.tag}
                    </span>
                  </div>
                </div>

                <div className="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-2">
                  <FiZap size={14} /> {blade.subtitle}
                </div>
                <h3 className="text-3xl font-black text-white uppercase mb-3 tracking-tight">{blade.name}</h3>
                
                <div className="bg-neutral-950 p-4 rounded-xl border border-white/5 text-xs space-y-2 mb-6 font-mono text-neutral-300">
                  <div><strong className="text-neutral-500">SPECS:</strong> {blade.specs}</div>
                  <div><strong className="text-neutral-500">TARGET MATERIAL:</strong> {blade.material}</div>
                  <div className="pt-2 border-t border-white/5 text-amber-400 font-bold flex items-center gap-2 text-xs">
                    <FiStar className="text-amber-400" /> {blade.contractorOffer}
                  </div>
                </div>

                <p className="text-xs text-neutral-400 leading-relaxed mb-6">
                  {blade.description}
                </p>
              </div>

              <div className="flex gap-4 pt-4 border-t border-white/5">
                <Link 
                  href="/login"
                  className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-neutral-950 font-black text-xs uppercase tracking-wider py-3.5 px-6 rounded-xl transition-all shadow-lg text-center flex items-center justify-center gap-2"
                >
                  <FiLock /> Log In for Rates
                </Link>
                <Link 
                  href="/contact"
                  className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs py-3.5 px-6 rounded-xl border border-white/10 transition-colors"
                >
                  Request Quote
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
