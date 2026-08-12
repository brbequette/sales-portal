import Link from 'next/link';
import { Metadata } from 'next';
import { FiZap, FiShield, FiLock, FiArrowRight, FiStar } from 'react-icons/fi';

export const metadata: Metadata = {
  title: 'Titan Signature Warrior Series Blades | Titan Diamond USA',
  description: 'The legendary Titan Signature Warrior Series - high-art custom graphics circular diamond saw blades engineered for extreme concrete, asphalt, and rebar cutting.',
};

const SIGNATURE_BLADES = [
  {
    id: "dragon",
    name: "THE DRAGON",
    subtitle: "Premium Asphalt & Green Concrete Undercut Blade",
    image: "/images/signature/dragon.jpg",
    specs: '14" x .125" x 1" Arbor | 12mm Segments + 14mm Drop Segment',
    material: "Asphalt over Concrete, Green Concrete, Soft Aggregate",
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
    description: "Thunderbolt diamond matrix formulation sheds worn diamond grit rapidly to slice through rebar.",
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
    description: "Snakeskin perimeter segment matrix engineered for zero chip cutting on hard natural stone and quartzite.",
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
  }
];

export default function SignatureSeriesPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen">
      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-950 border-b border-white/10 text-center relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 relative z-10">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 px-4 py-1.5 rounded-full mb-4">
            <FiZap className="text-amber-400 animate-pulse" size={16} />
            <span className="text-xs font-black uppercase tracking-widest text-amber-300">
              LEGENDARY WARRIOR ARTWORK SERIES
            </span>
          </div>
          
          <h1 className="text-4xl sm:text-7xl font-black uppercase tracking-tight mb-6 text-white leading-none">
            TITAN SIGNATURE BLADES
          </h1>
          <p className="text-neutral-300 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            High-art custom graphic cores fused with commercial-grade laser welded diamond segments. Built for contractors who cut without compromise.
          </p>
        </div>
      </section>

      {/* Grid Showcase */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {SIGNATURE_BLADES.map((blade) => (
            <div 
              key={blade.id}
              className="bg-neutral-900/80 border border-amber-500/30 rounded-3xl p-8 hover:border-amber-500/60 transition-all shadow-[0_0_40px_rgba(245,158,11,0.08)] flex flex-col justify-between group"
            >
              <div>
                <div className="relative h-72 bg-gradient-to-b from-neutral-950 to-neutral-900 rounded-2xl flex items-center justify-center p-6 mb-6 border border-white/5 overflow-hidden">
                  <img 
                    src={blade.image} 
                    alt={blade.name} 
                    className="max-h-full max-w-full object-contain filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.9)] group-hover:scale-105 transition-transform duration-500" 
                  />
                  <div className="absolute top-4 left-4">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-amber-500 text-neutral-950 font-bold px-3 py-1 rounded-full shadow-md">
                      {blade.tag}
                    </span>
                  </div>
                </div>

                <div className="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider mb-1">
                  {blade.subtitle}
                </div>
                <h3 className="text-3xl font-black text-white uppercase mb-2">{blade.name}</h3>
                
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

              <div className="flex gap-4">
                <Link 
                  href="/login"
                  className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black text-xs uppercase tracking-wider py-3.5 px-6 rounded-xl transition-all shadow-lg text-center flex items-center justify-center gap-2"
                >
                  <FiLock /> Sign In for BOGO Deal
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
