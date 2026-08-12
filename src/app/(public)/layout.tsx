import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ScrollProgress } from '@/components/ScrollProgress';
import { FloatingCallBar } from '@/components/FloatingCallBar';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-amber-500/30 font-sans transition-colors duration-300">
      <ScrollProgress />
      {/* Top Announcement Bar */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 text-white text-[11px] font-bold py-1.5 px-4 text-center tracking-wider uppercase flex items-center justify-center gap-4 border-b border-amber-500/20">
        <span>⚡ DIRECT CONTRACTOR PRICING & SAME-DAY NATIONWIDE SHIPPING</span>
        <span className="hidden sm:inline text-amber-200">•</span>
        <a href="tel:18005550199" className="hidden sm:inline hover:underline font-extrabold text-amber-100">
          CALL SALES: (800) 555-0199
        </a>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-neutral-950/90 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <img 
              src="/titan-logo.png" 
              alt="Titan Diamond USA Spartan Logo" 
              className="h-12 w-auto object-contain filter drop-shadow-[0_0_12px_rgba(245,158,11,0.3)] group-hover:scale-105 transition-all duration-300"
            />
            <div>
              <span className="text-lg font-black tracking-tight bg-gradient-to-r from-white via-neutral-200 to-amber-400 bg-clip-text text-transparent block">
                TITAN DIAMOND
              </span>
              <span className="text-[10px] text-amber-500 font-extrabold tracking-widest block -mt-1 uppercase">
                PRO INDUSTRIAL USA
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden lg:flex items-center gap-5">
            <Link href="/shop" className="text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors">
              Catalog
            </Link>
            <Link href="/signature-series" className="text-xs font-black uppercase tracking-wider text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full">
              🔥 Signature Series
            </Link>
            <Link href="/blade-finder" className="text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors flex items-center gap-1">
              ⚡ Blade Finder
            </Link>
            <Link href="/knowledge-test" className="text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors flex items-center gap-1">
              🏆 Certified Quiz
            </Link>
            <Link href="/rpm-calculator" className="text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors flex items-center gap-1">
              ⚙️ RPM Calc
            </Link>
            <Link href="/blade-comparator" className="text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors flex items-center gap-1">
              🔍 Comparator
            </Link>
            <Link href="/unit-converter" className="text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors flex items-center gap-1">
              📏 Unit Conv
            </Link>
            <Link href="/applications/concrete-cutting" className="text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors">
              Concrete Saws
            </Link>
            <Link href="/careers" className="text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors">
              Careers
            </Link>
            <Link href="/contact" className="text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors">
              Contact
            </Link>
          </nav>

          {/* Login CTA & Theme Toggle */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link 
              href="/login" 
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.25)] hover:shadow-[0_0_30px_rgba(245,158,11,0.45)] transition-all active:scale-95 border border-amber-400/30"
            >
              Contractor Login
            </Link>
          </div>
        </div>
      </header>
      
      <main>{children}</main>
      
      {/* Footer */}
      <footer className="border-t border-white/10 bg-neutral-950 pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          <div>
            <Link href="/" className="flex items-center gap-3 mb-6">
              <img src="/titan-logo.png" alt="Titan Diamond USA" className="h-10 w-auto" />
              <div>
                <span className="text-base font-black tracking-tight text-white block">TITAN DIAMOND</span>
                <span className="text-[9px] text-amber-500 font-bold tracking-widest block -mt-1">USA DIVISION</span>
              </div>
            </Link>
            <p className="text-xs text-neutral-400 leading-relaxed mb-4">
              Premium diamond cutting blades, core bits, cup wheels, and abrasives engineered for extreme performance on concrete, stone, and asphalt.
            </p>
            <div className="text-[11px] font-mono text-amber-400">
              Contractor Direct • Same Day Shipping
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white mb-6 uppercase tracking-widest text-amber-400">Product Categories</h3>
            <ul className="space-y-3 text-xs">
              <li><Link href="/shop?category=Professional Blades" className="text-neutral-400 hover:text-white transition-colors">Professional Saw Blades</Link></li>
              <li><Link href="/shop?category=Core Bits" className="text-neutral-400 hover:text-white transition-colors">Diamond Core Bits</Link></li>
              <li><Link href="/shop?category=Concrete Polisher" className="text-neutral-400 hover:text-white transition-colors">Concrete Polishers & Cup Wheels</Link></li>
              <li><Link href="/shop?category=Turbo Blades" className="text-neutral-400 hover:text-white transition-colors">Turbo & Tile Blades</Link></li>
              <li><Link href="/shop?category=ZENESIS™" className="text-neutral-400 hover:text-white transition-colors">ZENESIS™ Pattern Tech</Link></li>
              <li><Link href="/shop?category=DIAMONDX™" className="text-neutral-400 hover:text-white transition-colors">DIAMONDX™ Series</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white mb-6 uppercase tracking-widest text-amber-400">Support & Company</h3>
            <ul className="space-y-3 text-xs">
              <li><Link href="/resources" className="text-neutral-400 hover:text-white transition-colors">Technical Guides & Publications</Link></li>
              <li><Link href="/careers" className="text-neutral-400 hover:text-white transition-colors">Careers & Job Openings</Link></li>
              <li><Link href="/about" className="text-neutral-400 hover:text-white transition-colors">About Titan Diamond USA</Link></li>
              <li><Link href="/contact" className="text-neutral-400 hover:text-white transition-colors">Request Custom Quote</Link></li>
              <li><Link href="/login" className="text-neutral-400 hover:text-white transition-colors">Contractor Account Portal</Link></li>
              <li><Link href="/admin-login" className="text-neutral-500 hover:text-amber-400 transition-colors">🔒 Internal Admin Portal</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white mb-6 uppercase tracking-widest text-amber-400">Contact Sales</h3>
            <ul className="space-y-3 text-xs">
              <li className="text-neutral-400 leading-relaxed">
                Titan Diamond USA<br />
                National Direct Sales & Distribution
              </li>
              <li>
                <a href="tel:18005550199" className="text-amber-400 font-bold hover:underline">
                  ☎ (800) 555-0199
                </a>
              </li>
              <li>
                <a href="mailto:sales@titandiamondusa.com" className="text-neutral-400 hover:text-white transition-colors">
                  ✉ sales@titandiamondusa.com
                </a>
              </li>
              <li className="pt-2">
                <Link 
                  href="/login"
                  className="inline-block bg-neutral-900 border border-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-black text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all"
                >
                  Log In for Pricing
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-white/5 text-center text-[11px] text-neutral-500 flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© 2026 Titan Diamond USA. All rights reserved. Professional Diamond Cutting Tools.</p>
          <div className="flex items-center gap-6 text-neutral-500">
            <Link href="/privacy" className="hover:text-neutral-300">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-neutral-300">Terms of Service</Link>
            <Link href="/admin-login" className="hover:text-amber-400 font-mono">Admin Login</Link>
          </div>
        </div>
      </footer>
      <FloatingCallBar />
    </div>
  );
}
