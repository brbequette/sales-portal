import Link from 'next/link';
import { Metadata } from 'next';
import { FiCheckCircle, FiShield, FiZap, FiTruck, FiAward, FiArrowRight } from 'react-icons/fi';

export const metadata: Metadata = {
  title: 'About Us | Titan Diamond USA',
  description: 'Learn about Titan Diamond USA - industry leaders in professional diamond cutting blades, core bits, and abrasive solutions for heavy construction.',
};

export default function AboutPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen">
      {/* Hero Banner */}
      <section className="py-20 bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-950 border-b border-white/10 text-center relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 relative z-10">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full inline-block mb-4">
            ENGINEERED FOR THE JOBSITE
          </span>
          <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight mb-6 text-white leading-tight">
            ABOUT TITAN DIAMOND USA
          </h1>
          <p className="text-neutral-300 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            We build commercial-grade diamond tools for professional concrete cutters, masons, and utility contractors who demand fast cutting speeds and zero downtime.
          </p>
        </div>
      </section>

      {/* Story & Tech Grid */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full inline-block mb-4">
              OUR MISSION
            </span>
            <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white mb-6">
              NO SEGMENT DROP. NO SLOW CUTTING.
            </h2>
            <div className="space-y-4 text-xs sm:text-sm text-neutral-300 leading-relaxed">
              <p>
                Founded to eliminate the quality compromises of retail hardware blades, Titan Diamond USA delivers direct-to-contractor diamond tooling engineered specifically for North American concrete aggregates and steel rebar density.
              </p>
              <p>
                Utilizing state-of-the-art laser welding, automated diamond concentration distribution, and heat-treated alloy steel cores, our blades maintain structural integrity under extreme operating temperatures and high-RPM saw forces.
              </p>
              <p>
                Whether you operate 100+ HP flat saws on highway paving projects or high-frequency electric core drills in nuclear facilities, Titan Diamond provides the exact matrix formulation required to maximize your linear feet per hour.
              </p>
            </div>
          </div>

          <div className="bg-neutral-900 border border-amber-500/30 rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col justify-center items-center text-center">
            <img 
              src="/product-images/SMX10LV.png" 
              alt="Titan Diamond Premium Blade" 
              className="max-h-64 object-contain filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.9)] mb-6 hover:scale-105 transition-transform"
            />
            <div className="bg-neutral-950 p-4 rounded-2xl border border-white/10 w-full max-w-sm">
              <div className="text-xs font-black text-amber-400 uppercase tracking-wider mb-1">
                LASER WELDED SEGMENT TECH
              </div>
              <div className="text-[11px] text-neutral-400">
                Segment bond joint strength exceeds 2.5x shear stress threshold.
              </div>
            </div>
          </div>
        </div>

        {/* 4 Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          <div className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 text-center">
            <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 mx-auto mb-4">
              <FiZap size={24} />
            </div>
            <h3 className="font-bold text-base mb-2 text-white">Maximum Speed</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">High diamond grit concentration for rapid penetration.</p>
          </div>

          <div className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 text-center">
            <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 mx-auto mb-4">
              <FiShield size={24} />
            </div>
            <h3 className="font-bold text-base mb-2 text-white">Laser Security</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">Laser-fused segment joints prevent segment loss.</p>
          </div>

          <div className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 text-center">
            <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 mx-auto mb-4">
              <FiTruck size={24} />
            </div>
            <h3 className="font-bold text-base mb-2 text-white">Fast Logistics</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">Same-day dispatch from our central distribution hub.</p>
          </div>

          <div className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 text-center">
            <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 mx-auto mb-4">
              <FiAward size={24} />
            </div>
            <h3 className="font-bold text-base mb-2 text-white">Contractor Tiers</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">Wholesale volume pricing and dedicated sales rep support.</p>
          </div>
        </div>

        {/* CTA Banner */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-3xl p-8 sm:p-12 text-center text-white shadow-2xl relative overflow-hidden">
          <h2 className="text-3xl font-black uppercase tracking-tight mb-3">EXPERIENCE THE TITAN DIFFERENCE</h2>
          <p className="text-xs sm:text-sm max-w-xl mx-auto mb-8 font-medium text-amber-100 leading-relaxed">
            Browse our full industrial catalog or log in to view exclusive contractor volume discounts.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/shop"
              className="bg-neutral-950 hover:bg-neutral-900 text-amber-400 font-black text-xs uppercase tracking-wider px-8 py-3.5 rounded-xl transition-all inline-flex items-center justify-center gap-2"
            >
              Explore Catalog <FiArrowRight />
            </Link>
            <Link 
              href="/login"
              className="bg-amber-400/20 hover:bg-amber-400/30 text-white font-bold text-xs uppercase tracking-wider px-8 py-3.5 rounded-xl border border-white/30 transition-all inline-flex items-center justify-center gap-2"
            >
              Contractor Login
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
