import Link from 'next/link';
import Image from 'next/image';
import { HeaderNav } from '@/components/HeaderNav';
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

      {/* Header Navigation */}
      <HeaderNav />
      
      <main>{children}</main>
      
      {/* Footer */}
      <footer className="border-t border-white/10 bg-neutral-950 pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          <div>
            <Link href="/" className="flex items-center gap-3 mb-6">
              <Image src="/titan-logo.png" alt="Titan Diamond USA" width={64} height={40} className="h-10 w-auto" />
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
              <li><Link href="/careers" className="text-neutral-400 hover:text-white transition-colors">Careers & Sales Rep Openings</Link></li>
              <li><Link href="/about" className="text-neutral-400 hover:text-white transition-colors">About Titan Diamond USA</Link></li>
              <li><Link href="/contact" className="text-neutral-400 hover:text-white transition-colors">Request Custom Quote</Link></li>
              <li><Link href="/login" className="text-neutral-300 font-bold hover:text-amber-400 transition-colors">👥 Contractor Account Portal</Link></li>
              <li><Link href="/employee-login" className="text-neutral-400 hover:text-amber-400 transition-colors font-mono">👔 Employee & Sales Rep Login</Link></li>
              <li><Link href="/admin-login" className="text-neutral-500 hover:text-amber-400 transition-colors text-[11px]">🔒 Internal Admin Portal</Link></li>
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
              <li className="pt-2 flex flex-col gap-2">
                <Link 
                  href="/login"
                  className="inline-block bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 text-center text-[11px] font-black uppercase px-3 py-2 rounded-xl transition-all shadow-md"
                >
                  Contractor Account Portal
                </Link>
                <Link 
                  href="/employee-login"
                  className="inline-block bg-neutral-900 border border-white/10 text-neutral-300 hover:text-amber-400 text-center text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all"
                >
                  Employee Login
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-white/5 text-center text-[11px] text-neutral-500 flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© 2026 Titan Diamond USA. All rights reserved. Professional Diamond Cutting Tools.</p>
          <div className="flex items-center gap-6 text-neutral-500">
            <Link href="/login" className="hover:text-amber-400 font-semibold">Contractor Portal</Link>
            <Link href="/employee-login" className="hover:text-amber-400 font-mono">Employee Login</Link>
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
