import Link from 'next/link';
import { Metadata } from 'next';
import { FiArrowRight, FiCheckCircle } from 'react-icons/fi';

export const metadata: Metadata = {
  title: 'Diamond Tooling Applications & Spec Guides | Titan Diamond USA',
  description: 'Explore Titan Diamond USA product applications for concrete cutting, core drilling, asphalt sawing, and surface prep floor grinding.',
};

const APPLICATIONS = [
  {
    slug: 'concrete-cutting',
    title: 'Concrete & Rebar Sawing',
    category: 'Heavy Construction & Slab Sawing',
    image: '/images/saw_blade.jpg',
    description: 'Laser-welded diamond blades engineered for hard river rock concrete, pre-stressed panels, highway slabs, and heavy rebar.',
    specs: [
      'Soft & medium matrix bond options',
      'Keyhole & drop-segment gullet designs',
      '12mm - 15mm segment height',
      '14" to 36" saw blade diameters',
    ],
    buttonText: 'View Concrete Cutting Specs',
    shopCategory: 'Professional Blades',
  },
  {
    slug: 'core-drilling',
    title: 'Concrete Core Drilling',
    category: 'Rig & Handheld Deep Drilling',
    image: '/images/core_bit.png',
    description: 'High-penetration rooftop crown segment core bits designed for electric, hydraulic, and handheld rig drilling through grade 60 rebar.',
    specs: [
      'Pre-grooved rooftop crown fast-start segments',
      '14" and 18" standard barrel depths',
      '1-1/4"-7 and 5/8"-11 thread arbors',
      'Wet water swivel slurry flush design',
    ],
    buttonText: 'View Core Bits Specs',
    shopCategory: 'Core Bits',
  },
  {
    slug: 'asphalt-cutting',
    title: 'Asphalt & Green Concrete',
    category: 'Abrasive Slurry & Undercut Protection',
    image: '/images/tuck_point.jpg',
    description: 'Hard bond matrix blades with slanted tungsten carbide undercut protection segments to prevent core erosion from abrasive sand slurry.',
    specs: [
      'Deep drop-segment core undercut protection',
      'Control joint early-entry saw compatible',
      'Hardened bond resists sand slurry wear',
      'Wet or dry cut capability',
    ],
    buttonText: 'View Asphalt Cutting Specs',
    shopCategory: 'Saw Blades',
  },
  {
    slug: 'surface-prep',
    title: 'Surface Prep & Grinding',
    category: 'Floor Restoration & Coating Removal',
    image: '/images/cup_wheel.png',
    description: 'Single row, double row, turbo cup wheels, PCD epoxy removal scrapers, and resin polishing pads for floor surface preparation.',
    specs: [
      'PCD scrapers for epoxy, paint & glue stripping',
      'Double row & arrow segment heavy slab leveling',
      'Resin polishing pads (50 grit to 3000 grit)',
      '5/8"-11 threaded arbor for standard grinders',
    ],
    buttonText: 'View Surface Prep Specs',
    shopCategory: 'Concrete Polisher',
  },
];

export default function ApplicationsHubPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen">
      {/* Hero */}
      <section className="py-16 sm:py-20 bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-950 border-b border-white/10 text-center relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 relative z-10">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full inline-block mb-4">
            JOBSITE SPECIFICATION GUIDES
          </span>
          <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight mb-4 text-white">
            DIAMOND TOOLING APPLICATIONS
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            Select your specific material application below to view formula matrix bonds, segment engineering details, and recommended diamond tooling specs.
          </p>
        </div>
      </section>

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {APPLICATIONS.map((app) => (
            <div 
              key={app.slug}
              className="bg-neutral-900/90 border border-white/10 rounded-3xl overflow-hidden hover:border-amber-500/40 transition-all hover:-translate-y-1 shadow-2xl flex flex-col justify-between group"
            >
              <div className="p-8">
                <div className="h-56 bg-neutral-950 rounded-2xl border border-white/5 p-6 flex items-center justify-center mb-6 overflow-hidden relative">
                  <img 
                    src={app.image} 
                    alt={app.title}
                    className="max-h-full max-w-full object-contain filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider bg-neutral-900/90 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-md">
                      {app.category}
                    </span>
                  </div>
                </div>

                <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-3 group-hover:text-amber-400 transition-colors">
                  {app.title}
                </h2>
                <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed mb-6">
                  {app.description}
                </p>

                <div className="space-y-2 pt-4 border-t border-white/10 mb-6">
                  {app.specs.map((spec, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 text-xs text-neutral-300 font-semibold">
                      <FiCheckCircle className="text-amber-400 shrink-0" size={15} />
                      <span>{spec}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-8 pt-0 flex flex-col sm:flex-row gap-3">
                <Link
                  href={`/applications/${app.slug}`}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl transition-all shadow-md text-center flex items-center justify-center gap-2"
                >
                  {app.buttonText} <FiArrowRight size={14} />
                </Link>
                <Link
                  href={`/shop?category=${encodeURIComponent(app.shopCategory)}`}
                  className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs py-3.5 px-4 rounded-xl border border-white/10 transition-colors text-center"
                >
                  Shop Catalog
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
