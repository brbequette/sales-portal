import Link from 'next/link';
import { Metadata } from 'next';
import { FiTarget, FiTruck, FiDollarSign, FiPhoneCall, FiMail, FiHexagon, FiDisc, FiLayers, FiSun, FiActivity } from 'react-icons/fi';

export const metadata: Metadata = {
  title: 'Titan Diamond USA | Premium Diamond Products',
  description: 'Titan Diamond USA supplies the finest diamond blades, core bits, and abrasive products to contractors and distributors nationwide.',
  openGraph: {
    title: 'Titan Diamond USA | Premium Diamond Products',
    description: 'Titan Diamond USA supplies the finest diamond blades, core bits, and abrasive products to contractors and distributors nationwide.',
    type: 'website',
  }
};

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20 lg:pt-48 lg:pb-32 flex items-center min-h-[90vh]">
        {/* Abstract Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-neutral-950" />
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-orange-600/10 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[60%] rounded-full bg-amber-500/10 blur-[120px]" />
          <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-20 mix-blend-overlay" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-neutral-950/80 to-neutral-950" />
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10 w-full text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-orange-400 text-xs font-semibold mb-8 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
            Industry Leading Performance
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-tight leading-[1.1] mb-6 max-w-4xl mx-auto drop-shadow-2xl">
            Premium Diamond Products for <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-600">Industry Professionals</span>
          </h1>
          <p className="text-lg md:text-xl text-neutral-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Titan Diamond USA supplies the finest diamond blades, core bits, and abrasive products to contractors and distributors nationwide. Built for maximum performance and durability.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/shop" className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-lg px-8 py-4 rounded-xl shadow-[0_0_30px_rgba(249,115,22,0.4)] hover:shadow-[0_0_40px_rgba(249,115,22,0.6)] transition-all active:scale-95 flex items-center justify-center gap-2">
              Browse Catalog
            </Link>
            <Link href="/login" className="w-full sm:w-auto bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold text-lg px-8 py-4 rounded-xl backdrop-blur-md transition-all active:scale-95 flex items-center justify-center gap-2">
              Sign In to Portal
            </Link>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-24 bg-neutral-950 relative z-10 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-neutral-900/50 border border-white/5 hover:border-orange-500/30 hover:bg-neutral-900 transition-all group">
              <div className="w-14 h-14 bg-orange-500/10 text-orange-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <FiTarget className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-white mb-4">Premium Quality</h3>
              <p className="text-neutral-400 leading-relaxed">
                Laser-welded segments, high diamond concentration, and superior bonding for maximum performance and longevity on the toughest jobs.
              </p>
            </div>
            <div className="p-8 rounded-3xl bg-neutral-900/50 border border-white/5 hover:border-orange-500/30 hover:bg-neutral-900 transition-all group">
              <div className="w-14 h-14 bg-orange-500/10 text-orange-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <FiTruck className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-white mb-4">Fast Shipping</h3>
              <p className="text-neutral-400 leading-relaxed">
                Same-day shipping on in-stock items. Direct from our warehouse to your job site to keep your projects running on schedule.
              </p>
            </div>
            <div className="p-8 rounded-3xl bg-neutral-900/50 border border-white/5 hover:border-orange-500/30 hover:bg-neutral-900 transition-all group">
              <div className="w-14 h-14 bg-orange-500/10 text-orange-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <FiDollarSign className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-white mb-4">Wholesale Pricing</h3>
              <p className="text-neutral-400 leading-relaxed">
                Competitive pricing for contractors and distributors. Sign in to your account to view exclusive rates and volume discounts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Product Categories */}
      <section className="py-24 bg-neutral-900 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black text-white mb-6">Our Core Categories</h2>
            <p className="text-neutral-400 max-w-2xl mx-auto text-lg">Precision-engineered tools for concrete, masonry, and stone applications.</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {[
              { name: 'Diamond Blades', icon: FiDisc, query: 'blades' },
              { name: 'Core Bits', icon: FiHexagon, query: 'core-bits' },
              { name: 'Cup Wheels', icon: FiActivity, query: 'cup-wheels' },
              { name: 'Polishing Pads', icon: FiSun, query: 'polishing' },
              { name: 'Wire Products', icon: FiLayers, query: 'wire' },
            ].map((cat, i) => (
              <Link 
                key={i} 
                href={`/shop?category=${cat.query}`}
                className="group relative p-[1px] rounded-2xl overflow-hidden bg-gradient-to-b from-white/10 to-transparent hover:from-orange-500/50 hover:to-amber-500/10 transition-all"
              >
                <div className="absolute inset-0 bg-neutral-950/80 group-hover:bg-neutral-950/60 transition-colors z-0" />
                <div className="relative z-10 p-8 flex flex-col items-center text-center gap-4 h-full bg-neutral-900/80 rounded-2xl group-hover:bg-transparent transition-colors">
                  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-orange-500/50 group-hover:bg-orange-500/10 group-hover:text-orange-400 text-neutral-400 transition-all">
                    <cat.icon className="w-8 h-8" />
                  </div>
                  <h3 className="font-bold text-white group-hover:text-orange-400 transition-colors">{cat.name}</h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24 bg-neutral-950 relative z-10 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 divide-y md:divide-y-0 md:divide-x divide-white/5 text-center">
            <div className="pt-8 md:pt-0">
              <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-600 mb-2">10,000+</div>
              <div className="text-neutral-400 font-medium tracking-wider uppercase text-sm">Products in Stock</div>
            </div>
            <div className="pt-8 md:pt-0">
              <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-600 mb-2">500+</div>
              <div className="text-neutral-400 font-medium tracking-wider uppercase text-sm">B2B Customers</div>
            </div>
            <div className="pt-8 md:pt-0">
              <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-600 mb-2">24/7</div>
              <div className="text-neutral-400 font-medium tracking-wider uppercase text-sm">Same-Day Shipping</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-24 relative z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-900/40 via-neutral-950 to-neutral-950" />
        <div className="max-w-5xl mx-auto px-6 relative z-10 text-center bg-neutral-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-12 md:p-20 shadow-2xl">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6">Ready to Save? Get Our <span className="text-orange-500">Amazing Introductory Offer</span></h2>
          <p className="text-xl text-neutral-300 mb-10 max-w-3xl mx-auto">
            Call us or create an account to access wholesale pricing and exclusive deals for your business.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a href="tel:1-800-555-0199" className="bg-white text-neutral-950 font-bold text-lg px-8 py-4 rounded-xl shadow-lg hover:bg-neutral-200 transition-all flex items-center justify-center gap-3">
              <FiPhoneCall className="w-5 h-5" />
              Call Now
            </a>
            <Link href="/contact" className="bg-orange-600 hover:bg-orange-500 text-white font-bold text-lg px-8 py-4 rounded-xl shadow-lg hover:shadow-orange-500/25 transition-all flex items-center justify-center gap-3">
              <FiMail className="w-5 h-5" />
              Request Quote
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
