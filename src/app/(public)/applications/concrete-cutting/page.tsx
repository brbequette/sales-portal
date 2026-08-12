import Link from 'next/link';
import { Metadata } from 'next';
import { FiCheckCircle, FiLock, FiArrowRight, FiZap, FiPhone } from 'react-icons/fi';

export const metadata: Metadata = {
  title: 'Concrete Cutting Diamond Blades | Titan Diamond USA',
  description: 'Heavy duty laser welded diamond saw blades engineered for reinforced concrete, hard river rock aggregate, and grade 60 rebar penetration.',
};

export default function ConcreteCuttingPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen">
      {/* Hero */}
      <section className="py-16 bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-950 border-b border-white/10 text-center">
        <div className="max-w-4xl mx-auto px-4">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full inline-block mb-3">
            APPLICATION GUIDE & PRODUCT LINE
          </span>
          <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight mb-4 text-white">
            CONCRETE CUTTING BLADES
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            High-speed laser-welded diamond blades engineered for reinforced slab, hard river rock concrete, pre-stressed panels, and heavy rebar.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-8">
              <h2 className="text-2xl font-black uppercase text-white mb-4">
                ENGINEERED FOR NORTH AMERICAN HARD AGGREGATE
              </h2>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-6">
                Cutting reinforced concrete requires a soft-to-medium matrix bond that continuously exposes fresh diamond grit under heavy heat and impact. Titan Diamond SMX and ZENESIS™ series blades utilize 12mm-15mm deep segments with keyhole gullets to remove slurry quickly and cool the steel core.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>Laser welded joint strength exceeding 2.5x shear stress</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>12mm - 15mm segment height for maximum footage</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>Keyhole gullet design for rapid slurry evacuation</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>High RPM rating for gas saws and flat saws</span>
                </div>
              </div>
            </div>

            {/* Featured Concrete Blades */}
            <div className="space-y-4">
              <h3 className="text-lg font-black uppercase text-white tracking-wider">Top Rated Concrete Saw Blades</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <img src="/product-images/SMX10LV.png" alt="SMX10 Concrete Blade" className="h-44 object-contain mx-auto mb-4" />
                    <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded">SMX ULTRA-PRO</span>
                    <h4 className="font-bold text-white text-base mt-2 mb-1">SMX10 Concrete & Rebar Blade 14"</h4>
                    <p className="text-xs text-neutral-400 mb-4">Soft bond matrix engineered for hard 6000+ PSI aggregate and heavy rebar.</p>
                  </div>
                  <Link href="/shop?category=Professional Blades" className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-xs py-2.5 rounded-xl text-center block">
                    View in Catalog →
                  </Link>
                </div>

                <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <img src="/product-images/ZSRX30UT.jpg" alt="ZENESIS Concrete Blade" className="h-44 object-contain mx-auto mb-4" />
                    <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded">ZENESIS™ 3D GRID</span>
                    <h4 className="font-bold text-white text-base mt-2 mb-1">ZENESIS™ ZSRX30 Concrete Blade 16"</h4>
                    <p className="text-xs text-neutral-400 mb-4">3D grid aligned diamonds for 50% faster cut speeds with less saw drag.</p>
                  </div>
                  <Link href="/shop?category=ZENESIS™" className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-xs py-2.5 rounded-xl text-center block">
                    View in Catalog →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-amber-500/30 rounded-3xl p-6 shadow-xl">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 block mb-2">QUICK TOOL SELECTOR</span>
              <h3 className="text-base font-bold text-white mb-3">Find Blade for Your Saw</h3>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                Use our interactive jobsite spec finder to select your exact saw horsepower and aggregate hardness.
              </p>
              <Link 
                href="/blade-finder"
                className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs py-3 px-4 rounded-xl text-center block transition-colors"
              >
                Launch Interactive Spec Finder
              </Link>
            </div>

            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 text-center">
              <h3 className="font-bold text-white text-sm mb-2">Contractor Bulk Pricing</h3>
              <p className="text-xs text-neutral-400 mb-4">Log in to view 5+, 10+, and 50+ quantity tier discounts on concrete blades.</p>
              <Link href="/login" className="w-full bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold py-2.5 rounded-xl border border-white/10 block">
                Contractor Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
