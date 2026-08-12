import Link from 'next/link';
import { Metadata } from 'next';
import { FiCheckCircle, FiLock, FiArrowRight } from 'react-icons/fi';

export const metadata: Metadata = {
  title: 'Concrete Grinding Cup Wheels & PCD Coatings Removal | Titan Diamond USA',
  description: 'Aggressive diamond cup wheels, PCD epoxy removal tools, and concrete floor polishing pads for contractors.',
};

export default function SurfacePrepPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen">
      <section className="py-16 bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-950 border-b border-white/10 text-center">
        <div className="max-w-4xl mx-auto px-4">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full inline-block mb-3">
            FLOORING & COATING REMOVAL
          </span>
          <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight mb-4 text-white">
            SURFACE PREP & CUP WHEELS
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            Single row, double row, turbo cup wheels, PCD chip removal tools, and wet/dry resin polishing pads for concrete restoration.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-8">
              <h2 className="text-2xl font-black uppercase text-white mb-4">PCD & TURBO SEGMENT TECHNOLOGY</h2>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-6">
                Removing thick mastic, epoxy, polyurea, and carpet glue requires polycrystalline diamond (PCD) scraper segments that scrape coatings without gumming or loading up.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>PCD Scrapers for epoxy, paint & glue stripping</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>Double row & arrow segment heavy slab leveling</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>Resin polishing pads from 50 grit to 3000 grit</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>5/8"-11 arbor threads for standard grinders</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <img src="/product-images/RCG.png" alt="RCG Cup Wheel" className="h-44 object-contain mx-auto mb-4" />
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded">TURBO GRINDING</span>
                  <h4 className="font-bold text-white text-base mt-2 mb-1">Titan RCG Heavy Duty Cup Wheel 7"</h4>
                  <p className="text-xs text-neutral-400 mb-4">Aggressive continuous turbo rim for rapid concrete slab leveling and lip removal.</p>
                </div>
                <Link href="/shop?category=Concrete Polisher" className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-xs py-2.5 rounded-xl text-center block">
                  View Grinding Tools →
                </Link>
              </div>

              <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <img src="/product-images/ASFM.png" alt="Polishing Pads" className="h-44 object-contain mx-auto mb-4" />
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded">FLOOR POLISHING</span>
                  <h4 className="font-bold text-white text-base mt-2 mb-1">ASFM Hybrid Resin Polishing Set (50#-3000#)</h4>
                  <p className="text-xs text-neutral-400 mb-4">7-piece floor polishing pad set for high-gloss mirror finish concrete and terrazzo.</p>
                </div>
                <Link href="/shop?category=Concrete Polisher" className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-xs py-2.5 rounded-xl text-center block">
                  View Polishing Pads →
                </Link>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6">
              <h3 className="font-bold text-white text-base mb-2">Contractor Volume Tiers</h3>
              <p className="text-xs text-neutral-400 mb-4">Order cup wheel boxes of 10 or 25 to unlock direct contractor volume pricing.</p>
              <Link href="/login" className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs py-3 rounded-xl block text-center">
                Log In for Wholesale Pricing
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
