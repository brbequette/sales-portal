import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-neutral-900 border border-white/10 rounded-3xl p-8 sm:p-12">
        <h1 className="text-3xl font-black uppercase tracking-tight mb-6 text-white">Privacy Policy</h1>
        <p className="text-xs text-neutral-400 mb-6">Last updated: February 2026</p>
        
        <div className="space-y-6 text-xs text-neutral-300 leading-relaxed">
          <p>
            Titan Diamond USA (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) respects your privacy and is committed to protecting contractor, customer, and partner personal data.
          </p>

          <h2 className="text-base font-bold text-white uppercase mt-6">1. Information We Collect</h2>
          <p>
            We collect company name, contact information, business address, telephone numbers, and purchase transaction records required to fulfill industrial tool orders and manage contractor accounts.
          </p>

          <h2 className="text-base font-bold text-white uppercase mt-6">2. Use of Information</h2>
          <p>
            Information collected is used strictly for processing orders, managing wholesale pricing tiers, delivering products, sending invoice updates, and providing technical support.
          </p>

          <h2 className="text-base font-bold text-white uppercase mt-6">3. Data Security</h2>
          <p>
            We enforce industry-standard encryption protocols and secure database controls to safeguard customer account details.
          </p>

          <div className="pt-6 border-t border-white/10 flex justify-between items-center">
            <Link href="/" className="text-amber-400 font-bold hover:underline">← Return to Titan Home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
