import Link from 'next/link';
import { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FiBookOpen, FiDownload, FiExternalLink, FiHelpCircle, FiLock } from 'react-icons/fi';

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

type ProductSheet = {
  productName: string;
  typeName: string;
  category: string;
  outputFile: string;
};

function getProductSheets(): ProductSheet[] {
  try {
    const manifestPath = path.join(process.cwd(), 'public', 'downloads', 'product-sheets', 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { sheets?: ProductSheet[] };
    return manifest.sheets ?? [];
  } catch {
    return [];
  }
}

export default function ResourcesPage() {
  const productSheets = getProductSheets();
  const groupedSheets = Object.entries(
    productSheets.reduce<Record<string, ProductSheet[]>>((groups, sheet) => {
      (groups[sheet.category] ??= []).push(sheet);
      return groups;
    }, {})
  ).sort(([left], [right]) => left.localeCompare(right));

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
        {productSheets.length > 0 && (
          <section className="mb-14" aria-labelledby="product-sheet-library">
            <div className="mb-7 flex flex-col gap-5 rounded-3xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 via-neutral-900 to-neutral-950 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="max-w-3xl">
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-400">Field-ready technical library</span>
                <h2 id="product-sheet-library" className="mt-2 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
                  Product sheets by tool family
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                  {productSheets.length} Titan-formatted references for blades, core bits, grinding, polishing, and specialty tooling. Use the family groups to get from application to specifications quickly.
                </p>
              </div>
              <a
                href="/downloads/product-sheets/titan-product-sheet-library-index.pdf"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-xs font-black uppercase tracking-wide text-black transition hover:bg-orange-400"
              >
                <FiDownload aria-hidden /> Download library index
              </a>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groupedSheets.map(([category, sheets]) => (
                <details key={category} className="group rounded-2xl border border-white/10 bg-neutral-900/75 open:border-orange-500/35">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                    <span>
                      <span className="block text-sm font-black uppercase tracking-wide text-white">{category}</span>
                      <span className="mt-1 block text-[11px] text-neutral-500">{sheets.length} product sheets</span>
                    </span>
                    <span className="text-xl text-orange-400 transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <div className="border-t border-white/10 p-2">
                    {sheets.map((sheet) => (
                      <a
                        key={`${sheet.productName}-${sheet.outputFile}`}
                        href={`/downloads/product-sheets/${sheet.outputFile}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-white">{sheet.productName}</span>
                          <span className="block truncate text-[10px] text-neutral-500">{sheet.typeName}</span>
                        </span>
                        <FiExternalLink className="shrink-0 text-orange-400" aria-hidden />
                      </a>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}

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
              <h3 className="text-base font-bold text-white mb-2">Titan Contractor Field Guide</h3>
              <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                Seven printable pages covering blade selection, RPM and cutting depth, mounting, operation, troubleshooting, core drilling, and a reusable job record.
              </p>
              <a
                href="/downloads/titan-contractor-field-guide.pdf"
                target="_blank"
                rel="noreferrer"
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs py-3 px-4 rounded-xl border border-white/10 block text-center transition-colors flex items-center justify-center gap-2"
              >
                <FiDownload className="text-amber-400" /> Download Field Guide
              </a>
              <Link href="/technical-information" className="mt-3 block text-center text-xs font-bold text-amber-400 hover:underline">
                Open responsive technical reference
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
                href="tel:14804702577"
                className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs py-3 px-4 rounded-xl block text-center transition-colors"
              >
                Call Tech Sales: (480) 470-2577
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
