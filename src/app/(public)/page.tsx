import Link from 'next/link';
import { Metadata } from 'next';
import { FiZap, FiTruck, FiShield, FiCheckCircle, FiLock, FiArrowRight, FiPhone, FiFileText, FiLayers } from 'react-icons/fi';
import { SparkCanvas } from '@/components/SparkCanvas';

export const metadata: Metadata = {
  title: 'Titan Diamond USA | Professional Diamond Blades & Concrete Cutting Tools',
  description: 'Industrial concrete cutting blades, diamond core bits, cup wheels, and abrasive products for contractors and distributors nationwide. Laser welded for maximum durability.',
};

const PRODUCT_CATEGORIES = [
  {
    title: "Professional Saw Blades",
    description: "High-speed laser-welded diamond blades for reinforced concrete, asphalt, and hard masonry.",
    categoryQuery: "Professional Blades",
    image: "/product-images/SMX10LV.png",
    badge: "HEAVY DUTY"
  },
  {
    title: "ZENESIS™ Pattern Tech",
    description: "Equidistant diamond placement for 50% faster cutting speed and extended blade longevity.",
    categoryQuery: "ZENESIS™",
    image: "/product-images/CD30M.jpg",
    badge: "PATENTED TECH"
  },
  {
    title: "DIAMONDX™ Vacuum Brazed",
    description: "Extreme heat tolerance for steel, rebar, iron, and multi-purpose demolition cutting.",
    categoryQuery: "DIAMONDX™",
    image: "/product-images/DXA2730P.png",
    badge: "DEMOLITION GRADE"
  },
  {
    title: "Diamond Core Bits",
    description: "Wet and dry concrete core drilling bits engineered for fast penetration through heavy rebar.",
    categoryQuery: "Core Bits",
    image: "/product-images/DXA0125P.png",
    badge: "DEEP DRILLING"
  },
  {
    title: "Concrete Cup Wheels",
    description: "Aggressive surface grinding, epoxy coating removal, and slab prep cup wheels.",
    categoryQuery: "Concrete Polisher",
    image: "/product-images/RCG.png",
    badge: "SURFACE PREP"
  },
  {
    title: "Specialized Ring Saw Blades",
    description: "Deep cut ring saw blades for hydraulic and gas saws up to 16\" depth.",
    categoryQuery: "Saw Blades",
    image: "/product-images/SM20UT.png",
    badge: "DEEP CUT"
  }
];

export default function LandingPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-white/10 pt-12 pb-24 lg:pt-20 lg:pb-32 bg-neutral-950">
        <SparkCanvas />
        <div className="absolute inset-0 z-0 opacity-40">
          <img 
            src="/images/hero/hero_blade.jpg" 
            alt="Titan Diamond Blade Sparks" 
            className="w-full h-full object-cover object-center filter contrast-125 saturate-150"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/70 to-neutral-950/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/80 to-transparent" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3.5 py-1.5 rounded-full mb-6 backdrop-blur-md">
              <FiZap className="text-amber-400 animate-pulse" size={14} />
              <span className="text-xs font-black uppercase tracking-widest text-amber-300">
                INDUSTRIAL GRADE DIAMOND TOOLS
              </span>
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] text-white mb-6 uppercase">
              CUT THROUGH <br />
              <span className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_35px_rgba(245,158,11,0.4)]">
                ANYTHING.
              </span>
            </h1>

            <p className="text-neutral-300 text-base sm:text-lg mb-8 leading-relaxed font-normal max-w-2xl">
              Titan Diamond USA engineers high-speed, laser-welded diamond blades, core bits, and cup wheels designed specifically for professional concrete cutters, masons, and general contractors.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link 
                href="/shop"
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black text-sm uppercase tracking-wider px-8 py-4 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.3)] hover:shadow-[0_0_40px_rgba(245,158,11,0.5)] transition-all flex items-center justify-center gap-3 active:scale-98 border border-amber-400/40"
              >
                Browse Full Catalog <FiArrowRight size={18} />
              </Link>
              <Link 
                href="/login"
                className="bg-neutral-900/90 hover:bg-neutral-800 text-white font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-2xl border border-white/15 backdrop-blur-md transition-all flex items-center justify-center gap-2 hover:border-amber-500/40"
              >
                <FiLock className="text-amber-400" /> Contractor Pricing Login
              </Link>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-4 mt-12 pt-8 border-t border-white/10">
              <div>
                <div className="text-2xl sm:text-3xl font-black text-amber-400">10,000+</div>
                <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-semibold">Blades in Stock</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-amber-400">SAME-DAY</div>
                <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-semibold">Nationwide Dispatch</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-amber-400">100%</div>
                <div className="text-[11px] text-neutral-400 uppercase tracking-wider font-semibold">Jobsite Guarantee</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Pillars */}
      <section className="py-16 bg-neutral-950 border-b border-white/5 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-gradient-to-b from-neutral-900 to-neutral-950 p-8 rounded-3xl border border-white/10 hover:border-amber-500/30 transition-all group">
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 mb-6 group-hover:scale-110 transition-transform">
                <FiZap size={24} />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-wide mb-2">Laser Welded Segments</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Maximum segment retention prevents segment loss even under heavy rebar impacts and extreme friction heat.
              </p>
            </div>

            <div className="bg-gradient-to-b from-neutral-900 to-neutral-950 p-8 rounded-3xl border border-white/10 hover:border-amber-500/30 transition-all group">
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 mb-6 group-hover:scale-110 transition-transform">
                <FiTruck size={24} />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-wide mb-2">Contractor Direct Shipping</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Order directly from our factory warehouse straight to your jobsite or yard. No distributor middleman markups.
              </p>
            </div>

            <div className="bg-gradient-to-b from-neutral-900 to-neutral-950 p-8 rounded-3xl border border-white/10 hover:border-amber-500/30 transition-all group">
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 mb-6 group-hover:scale-110 transition-transform">
                <FiShield size={24} />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-wide mb-2">Contractor Tier Rates</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                High-volume bulk pricing, custom blade spec matching, and dedicated sales rep support for commercial projects.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Categories Showcase */}
      <section className="py-20 bg-neutral-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full inline-block mb-3">
                PRODUCT DIVISIONS
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">
                FEATURED DIAMOND TOOLING
              </h2>
            </div>
            <Link 
              href="/shop"
              className="text-xs font-bold uppercase tracking-wider text-amber-400 hover:text-amber-300 flex items-center gap-2 group"
            >
              View Full Product Line <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {PRODUCT_CATEGORIES.map((cat, idx) => (
              <Link 
                key={idx}
                href={`/shop?category=${encodeURIComponent(cat.categoryQuery)}`}
                className="bg-neutral-900/60 border border-white/10 rounded-3xl overflow-hidden hover:border-amber-500/40 transition-all duration-300 group flex flex-col justify-between hover:shadow-[0_10px_35px_rgba(245,158,11,0.12)]"
              >
                <div className="h-60 bg-gradient-to-b from-neutral-950 to-neutral-900 flex items-center justify-center p-8 relative border-b border-white/5">
                  <span className="absolute top-4 left-4 text-[9px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-full">
                    {cat.badge}
                  </span>
                  <img 
                    src={cat.image} 
                    alt={cat.title} 
                    className="max-h-full max-w-full object-contain filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)] group-hover:scale-110 transition-transform duration-500"
                  />
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors mb-2">
                      {cat.title}
                    </h3>
                    <p className="text-xs text-neutral-400 leading-relaxed mb-4">
                      {cat.description}
                    </p>
                  </div>
                  
                  <div className="flex items-center text-xs font-bold text-amber-400 gap-2 pt-4 border-t border-white/5">
                    Browse Specs <FiArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Technical Content Gate Teaser */}
      <section className="py-20 bg-neutral-900/60 border-y border-white/10 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full inline-block mb-4">
                CONTRACTOR KNOWLEDGE HUB
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight mb-6 leading-tight">
                OPTIMIZE BLADE LIFE & CUTTING SPEED
              </h2>
              <p className="text-neutral-300 text-sm sm:text-base leading-relaxed mb-6">
                Access technical field specs, wet vs dry cutting matrices, and aggregate hardness charts compiled by Titan Diamond master cutting technicians.
              </p>

              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-3 text-xs font-bold text-neutral-200">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={16} />
                  <span>Aggregate Hardness & Rebar Concentration Selectors</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold text-neutral-200">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={16} />
                  <span>Optimal RPM & Water Flow Rate Tables</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold text-neutral-200">
                  <FiCheckCircle className="text-amber-400 shrink-0" size={16} />
                  <span>Troubleshooting Segment Glazing & Core Wobble</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  href="/resources"
                  className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  <FiFileText size={16} /> Access Tech Publications
                </Link>
                <Link 
                  href="/login"
                  className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl border border-white/10 transition-colors flex items-center justify-center gap-2"
                >
                  <FiLock className="text-amber-400" /> Log In for Full Specs
                </Link>
              </div>
            </div>

            {/* Visual Card */}
            <div className="bg-neutral-950 border border-amber-500/30 rounded-3xl p-8 shadow-[0_0_50px_rgba(245,158,11,0.1)] relative">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-400">
                    <FiLayers size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">FIELD GUIDE PREVIEW</h4>
                    <span className="text-[10px] text-neutral-500">TITAN TECH PUBLICATION #402</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                  MEMBERS ONLY
                </span>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-neutral-900 p-4 rounded-xl border border-white/5">
                  <h5 className="text-xs font-bold text-white mb-1">Matrix Bond Selection Strategy</h5>
                  <p className="text-[11px] text-neutral-400">
                    Soft bond matrices cut hard non-abrasive river rock concrete; hard bonds resist abrasive asphalt wear...
                  </p>
                </div>

                <div className="bg-neutral-900 p-4 rounded-xl border border-white/5 relative overflow-hidden">
                  <div className="filter blur-[3px] select-none text-[11px] text-neutral-500">
                    Calculated segment wear rate per 100 linear feet at 4500 RPM under wet slurry conditions...
                  </div>
                  <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-xs flex items-center justify-center p-4 text-center">
                    <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                      <FiLock /> Sign Up or Log In to Read Full Matrix
                    </div>
                  </div>
                </div>
              </div>

              <Link 
                href="/login"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-xs uppercase tracking-wider py-3 rounded-xl block text-center shadow-md"
              >
                Sign In to Unlock All Technical Guides
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Callout */}
      <section className="py-20 bg-neutral-950 relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 border border-amber-500/30 rounded-3xl p-10 sm:p-14 shadow-[0_0_60px_rgba(245,158,11,0.12)] relative overflow-hidden">
            <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
              <img src="/images/logos/logo-dark.png" alt="Watermark" className="w-80 h-auto" />
            </div>

            <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full inline-block mb-4">
              DIRECT CONTRACTOR OFFERS
            </span>

            <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight mb-4">
              READY TO UPGRADE YOUR JOBSITE PERFORMANCE?
            </h2>

            <p className="text-neutral-400 text-sm sm:text-base max-w-2xl mx-auto mb-8 leading-relaxed">
              Call our direct sales team for custom volume quotes, intro BOGO blade programs, or register your account online.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="tel:18005550199"
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black text-xs uppercase tracking-wider px-8 py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <FiPhone size={16} /> Call Direct Sales: (800) 555-0199
              </a>
              <Link 
                href="/contact"
                className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs uppercase tracking-wider px-8 py-4 rounded-xl border border-white/10 transition-colors flex items-center justify-center gap-2"
              >
                Request Custom Quote
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
