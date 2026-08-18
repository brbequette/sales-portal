import Link from 'next/link';
import { Metadata } from 'next';
import { FiFileText, FiLock, FiCheckCircle, FiBookOpen, FiZap, FiDownload, FiHelpCircle } from 'react-icons/fi';

export const metadata: Metadata = {
  title: 'Technical Info & Publications | Titan Diamond USA',
  description: 'Concrete cutting technical specifications, diamond blade matrix guides, wet vs dry cutting manuals, and contractor field guides.',
};

const ARTICLES = [
  {
    id: "blade-selection-guide",
    title: "Master Diamond Blade Selection Matrix",
    category: "Technical Spec",
    excerpt: "Matching bond hardness to concrete PSI, rebar density, and aggregate type to prevent segment glazing and maximize blade life.",
    readTime: "6 min read",
    gated: false,
  },
  {
    id: "wet-vs-dry-cutting",
    title: "Wet vs. Dry Concrete Cutting Operational Manual",
    category: "Jobsite Safety & Specs",
    excerpt: "Cooling slurry flow rates, dust suppression compliance, and RPM calculations for hand-held vs walk-behind saws.",
    readTime: "8 min read",
    gated: true,
  },
  {
    id: "zenesis-pattern-technology",
    title: "ZENESIS™ Patterned Diamond Technology Whitepaper",
    category: "Engineering Report",
    excerpt: "How 3D grid diamond alignment reduces drag, increases cutting speed by 50%, and lowers saw motor stress.",
    readTime: "12 min read",
    gated: true,
  },
  {
    id: "core-drilling-troubleshooting",
    title: "Core Bit Drilling & Rebar Penetration Guide",
    category: "Field Operations",
    excerpt: "Preventing core bit chatter, binding in heavy rebar, and water swivel seal maintenance under high torque.",
    readTime: "10 min read",
    gated: true,
  }
];

export default function ResourcesPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen">
      {/* Header Banner */}
      <section className="py-16 bg-gradient-to-b from-neutral-900 via-neutral-950 to-neutral-950 border-b border-white/10 text-center">
        <div className="max-w-4xl mx-auto px-4">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full inline-block mb-3">
            TECHNICAL PUBLICATIONS & SPECS
          </span>
          <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tight mb-4 text-white">
            TITAN DIAMOND RESOURCE CENTER
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base leading-relaxed">
            Professional technical guides, blade matrix charts, and field manuals compiled for professional concrete saw operators and masons.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Articles List */}
          <div className="lg:col-span-2 space-y-8">
            <h2 className="text-xl font-black uppercase tracking-wider text-white flex items-center gap-2">
              <FiBookOpen className="text-amber-400" /> Featured Technical Guides
            </h2>

            {ARTICLES.map(article => (
              <div 
                key={article.id}
                className="bg-neutral-900/70 border border-white/10 rounded-3xl p-6 sm:p-8 hover:border-amber-500/30 transition-all relative overflow-hidden"
              >
                <div className="flex items-center justify-between gap-4 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                    {article.category}
                  </span>
                  <span className="text-xs font-mono text-neutral-500">{article.readTime}</span>
                </div>

                <h3 className="text-xl font-bold text-white mb-3 hover:text-amber-400 transition-colors">
                  {article.title}
                </h3>
                <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed mb-6">
                  {article.excerpt}
                </p>

                {article.gated ? (
                  <div className="bg-neutral-950 p-4 rounded-2xl border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-xs text-amber-400 font-bold">
                      <FiLock size={14} /> Contractor Account Required for Full Manual
                    </div>
                    <Link 
                      href="/login"
                      className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md shrink-0"
                    >
                      Sign In to Unlock Guide
                    </Link>
                  </div>
                ) : (
                  <div className="bg-neutral-950 p-4 rounded-2xl border border-white/5">
                    <div className="text-xs text-neutral-300 leading-relaxed mb-3">
                      <strong>Matrix Rule:</strong> Soft bond matrices (SMX10 series) are engineered for hard aggregates (quartz, river gravel, flint) so worn diamonds shed quickly, exposing fresh diamond edges. Hard bond matrices (SMX50 series) are formulated for green concrete and abrasive asphalt.
                    </div>
                    <Link 
                      href="/shop"
                      className="text-xs font-bold text-amber-400 hover:underline inline-flex items-center gap-1"
                    >
                      Shop Corresponding Saw Blades →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Specs Download Box */}
            <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-amber-500/30 rounded-3xl p-6 shadow-xl">
              <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-400 mb-4">
                <FiDownload size={20} />
              </div>
              <h3 className="text-base font-bold text-white mb-2">Blade RPM & Spec Sheet PDF</h3>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                Download printable jobsite reference sheets for hand-held, walk-behind, and masonry saw operating parameters.
              </p>
              <Link 
                href="/login"
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs py-3 px-4 rounded-xl border border-white/10 block text-center transition-colors flex items-center justify-center gap-2"
              >
                <FiLock className="text-amber-400" /> Log In to Download PDFs
              </Link>
            </div>

            {/* Need Direct Advice? */}
            <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6">
              <div className="w-10 h-10 bg-neutral-800 border border-white/10 rounded-xl flex items-center justify-center text-white mb-4">
                <FiHelpCircle size={20} />
              </div>
              <h3 className="text-base font-bold text-white mb-2">Custom Application Support</h3>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                Need a custom blade matrix for pre-stressed concrete or asphalt over concrete? Speak directly with a Titan sales technician.
              </p>
              <a 
                href="tel:18005550199"
                className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs py-3 px-4 rounded-xl block text-center transition-colors"
              >
                Call Tech Sales: (800) 555-0199
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
