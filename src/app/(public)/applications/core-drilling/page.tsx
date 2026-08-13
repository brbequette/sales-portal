import Link from 'next/link';
import { Metadata } from 'next';
import { FiCheckCircle, FiLock, FiArrowRight } from 'react-icons/fi';

export const metadata: Metadata = {
  title: 'Concrete Core Bits & Diamond Drilling | Titan Diamond USA',
  description: 'Industrial wet and dry concrete core drilling bits engineered for fast penetration through heavily reinforced concrete, brick, and stone.',
};

export default function CoreDrillingPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen">
      <section className="py-16 bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-950 border-b border-white/10 text-center">
        <div className="max-w-4xl mx-auto px-4">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full inline-block mb-3">
            DEEP DRILLING SOLUTIONS
          </span>
          <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight mb-4 text-white">
            CONCRETE CORE BITS
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            High-penetration rooftop segment core bits designed for electric, hydraulic, and hand-held rig drilling through grade 60 rebar and hard rock.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-8">
              <h2 className="text-2xl font-black uppercase text-white mb-4">ROOFTOP SEGMENT FAST-START DESIGN</h2>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed mb-6">
                Standard flat core bit segments can skate or chatter when starting a hole on hard concrete. Titan Diamond CD30 core bits feature pre-grooved rooftop crown segments that track immediately without walking.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>14" and 18" standard barrel depths</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>1-1/4"-7 threaded hubs for standard rig motors</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>5/8"-11 threads for handheld core drills</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-200 font-bold">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={18} />
                  <span>Wet water swivel slurry flush design</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <img 
                    src="/images/core_bit.png" 
                    alt="CD30 Core Bit" 
                    className="h-44 object-contain mx-auto mb-4 filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.7)]" 
                  />
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded">MASTER PRO CORE</span>
                  <h4 className="font-bold text-white text-base mt-2 mb-1">CD30 Concrete Core Bit 4" x 14"</h4>
                  <p className="text-xs text-neutral-400 mb-4">Rooftop crown segments for fast starting in 5000+ PSI rebar-reinforced concrete.</p>
                </div>
                <Link href="/shop?category=Core Bits" className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-xs py-2.5 rounded-xl text-center block">
                  View in Catalog →
                </Link>
              </div>

              <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <img 
                    src="/images/core_bit.png" 
                    alt="Heavy Duty Core Bit" 
                    className="h-44 object-contain mx-auto mb-4 filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.7)]" 
                  />
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded">HIGH REBAR BIT</span>
                  <h4 className="font-bold text-white text-base mt-2 mb-1">CD50 Heavy Rebar Core Bit 6" x 14"</h4>
                  <p className="text-xs text-neutral-400 mb-4">High diamond concentration for continuous penetration through steel rebar mesh and grade 60 bars.</p>
                </div>
                <Link href="/shop?category=Core Bits" className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-xs py-2.5 rounded-xl text-center block">
                  View in Catalog →
                </Link>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-amber-500/30 rounded-3xl p-6 shadow-xl">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 block mb-2">DRILL RIG COMPATIBILITY</span>
              <h3 className="text-base font-bold text-white mb-3">Custom Core Barrel Depths</h3>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                Need extra-long core bit barrels (24", 36", 48") or custom segment retipping? Contact our factory engineers.
              </p>
              <Link 
                href="/contact"
                className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs py-3 px-4 rounded-xl text-center block transition-colors"
              >
                Request Custom Core Specs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
