import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-neutral-900 border border-white/10 rounded-3xl p-8 sm:p-12">
        <h1 className="text-3xl font-black uppercase tracking-tight mb-6 text-white">Terms of Service</h1>
        <p className="text-xs text-neutral-400 mb-6">Last updated: February 2026</p>
        
        <div className="space-y-6 text-xs text-neutral-300 leading-relaxed">
          <p>
            By accessing or placing orders through Titan Diamond USA, you agree to comply with the following commercial terms.
          </p>

          <h2 className="text-base font-bold text-white uppercase mt-6">1. Commercial & Contractor Pricing</h2>
          <p>
            Wholesale contractor pricing is restricted to verified commercial accounts. Titan Diamond USA reserves the right to verify business credentials before releasing wholesale tier rates.
          </p>

          <h2 className="text-base font-bold text-white uppercase mt-6">2. Product Operation & Safety</h2>
          <p>
            Diamond blades, core bits, and cup wheels must be operated in strict accordance with ANSI B7.1 safety standards, proper blade guard installation, and required personal protective equipment (PPE).
          </p>

          <h2 className="text-base font-bold text-white uppercase mt-6">3. Shipping & Returns</h2>
          <p>
            In-stock items ordered before 2:00 PM EST ship same-day. Returns on unused diamond tooling are subject to inspection and standard restock terms.
          </p>

          <div className="pt-6 border-t border-white/10 flex justify-between items-center">
            <Link href="/" className="text-amber-400 font-bold hover:underline">← Return to Titan Home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
