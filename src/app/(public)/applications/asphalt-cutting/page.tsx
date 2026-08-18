import Link from 'next/link';
import { Metadata } from 'next';
import { FiCheckCircle, FiLock, FiArrowRight, FiZap } from 'react-icons/fi';

export const metadata: Metadata = {
  title: 'Asphalt & Green Concrete Diamond Blades | Titan Diamond USA',
  description: 'Hard bond matrix diamond blades engineered for abrasive asphalt, green concrete control joint expansion cutting, and sand aggregate.',
};

export default function AsphaltCuttingPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen">
      <section className="py-16 bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-950 border-b border-white/10 text-center">
        <div className="max-w-4xl mx-auto px-4">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full inline-block mb-3">
            ABRASIVE MATERIAL SPECIFICATIONS
          </span>
          <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight mb-4 text-white">
            ASPHALT & GREEN CONCRETE BLADES
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            Hardened matrix bond formulations equipped with drop-segment undercut protection to prevent premature core wear against sand and abrasive slurry.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-8">
              <h2 className="text-2xl font-black uppercase text-white mb-4">UNDERCUT PROTECTION TECHNOLOGY</h2>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-6">
                Cutting green concrete and asphalt generates harsh abrasive slurry that erodes steel cores under the weld line. Titan Diamond SMX50 series features slanted tungsten carbide undercut protection segments that shield the core joint and guarantee 100% segment wear life.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>Deep drop segments prevent core undercut</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>Hardened bond matrix resists sand slurry erosion</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>Control joint early-entry saw compatible</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>Wet slurry or dry vacuum cut options</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <img 
                    src="/images/tuck_point.jpg" 
                    alt="SMX50 Hard Bond Asphalt Blade" 
                    className="h-44 object-contain mx-auto mb-4 filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.7)]" 
                  />
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded">SMX HARD BOND</span>
                  <h4 className="font-bold text-white text-base mt-2 mb-1">SMX50 Hard-Bond Asphalt Blade 14"</h4>
                  <p className="text-xs text-neutral-400 mb-4">Hardened matrix bond formulation engineered for abrasive asphalt overlay and green concrete slab.</p>
                </div>
                <Link href="/shop?category=Saw Blades" className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-xs py-2.5 rounded-xl text-center block">
                  View in Catalog →
                </Link>
              </div>

              <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <img 
                    src="/images/tuck_point.jpg" 
                    alt="Undercut Protection Blade" 
                    className="h-44 object-contain mx-auto mb-4 filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.7)]" 
                  />
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded font-mono">UNDERCUT PRO</span>
                  <h4 className="font-bold text-white text-base mt-2 mb-1">Titan Asphalt & Slurry Blade 18"</h4>
                  <p className="text-xs text-neutral-400 mb-4">Deep drop segment protection for high horsepower road saws cutting green concrete joints.</p>
                </div>
                <Link href="/shop?category=Saw Blades" className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-xs py-2.5 rounded-xl text-center block">
                  View in Catalog →
                </Link>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-amber-500/30 rounded-3xl p-6 shadow-xl">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 block mb-2">SPEC MATCHING ASSISTANT</span>
              <h3 className="text-base font-bold text-white mb-3">Match Aggregate Hardness</h3>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                Need custom matrix bonds for river gravel or soft limestone aggregate? Our technical engineers match exact blade specs.
              </p>
              <Link 
                href="/blade-finder"
                className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs py-3 px-4 rounded-xl text-center block transition-colors"
              >
                Launch Blade Spec Finder
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
