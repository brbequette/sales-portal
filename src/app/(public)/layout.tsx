import Link from 'next/link';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-orange-500/30">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-neutral-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.4)] group-hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] transition-all">
              <span className="font-black text-white text-sm">T</span>
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight">Titan Diamond</span>
              <span className="text-[10px] text-neutral-500 block -mt-0.5 tracking-wider font-semibold">USA</span>
            </div>
          </Link>
          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/shop" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">Shop</Link>
            <Link href="/about" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">About</Link>
            <Link href="/contact" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors">Contact</Link>
          </nav>
          {/* Login CTA */}
          <Link href="/login" className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_25px_rgba(249,115,22,0.5)] transition-all active:scale-95">
            Sign In
          </Link>
        </div>
      </header>
      
      <main className="pt-16">{children}</main>
      
      {/* Footer */}
      <footer className="border-t border-white/5 bg-neutral-950 pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          <div>
            <Link href="/" className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-600 rounded-lg flex items-center justify-center">
                <span className="font-black text-white text-xs">T</span>
              </div>
              <div>
                <span className="text-sm font-bold">Titan Diamond</span>
                <span className="text-[10px] text-neutral-500 block -mt-0.5">USA</span>
              </div>
            </Link>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Premium diamond products and abrasive solutions for industry professionals, contractors, and distributors nationwide.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-wider">Quick Links</h3>
            <ul className="space-y-4">
              <li><Link href="/" className="text-sm text-neutral-400 hover:text-orange-500 transition-colors">Home</Link></li>
              <li><Link href="/shop" className="text-sm text-neutral-400 hover:text-orange-500 transition-colors">Shop All</Link></li>
              <li><Link href="/about" className="text-sm text-neutral-400 hover:text-orange-500 transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="text-sm text-neutral-400 hover:text-orange-500 transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-wider">Products</h3>
            <ul className="space-y-4">
              <li><Link href="/shop?category=blades" className="text-sm text-neutral-400 hover:text-orange-500 transition-colors">Diamond Blades</Link></li>
              <li><Link href="/shop?category=core-bits" className="text-sm text-neutral-400 hover:text-orange-500 transition-colors">Core Bits</Link></li>
              <li><Link href="/shop?category=cup-wheels" className="text-sm text-neutral-400 hover:text-orange-500 transition-colors">Cup Wheels</Link></li>
              <li><Link href="/shop?category=polishing" className="text-sm text-neutral-400 hover:text-orange-500 transition-colors">Polishing Pads</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-wider">Contact</h3>
            <ul className="space-y-4">
              <li className="text-sm text-neutral-400">123 Industrial Pkwy<br />Suite 100<br />Los Angeles, CA 90001</li>
              <li><a href="tel:1-800-555-0199" className="text-sm text-neutral-400 hover:text-orange-500 transition-colors">1-800-555-0199</a></li>
              <li><a href="mailto:sales@titandiamondusa.com" className="text-sm text-neutral-400 hover:text-orange-500 transition-colors">sales@titandiamondusa.com</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-white/5 text-center text-xs text-neutral-600 flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© 2026 Titan Diamond USA. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-neutral-400 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-neutral-400 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
