"use client";

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { FiChevronDown, FiMenu, FiX, FiZap, FiAward, FiSliders, FiLayers, FiRefreshCw, FiGrid, FiBriefcase, FiPhone, FiLock } from 'react-icons/fi';

export function HeaderNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);
  const [appsDropdownOpen, setAppsDropdownOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-sticky bg-neutral-950/95 backdrop-blur-xl border-b border-white/10 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
        
        {/* Logo (Image only - no text overlap) */}
        <Link href="/" className="flex items-center group shrink-0">
          <Image 
            src="/titan-logo.png" 
            alt="Titan Diamond USA Spartan Logo" 
            width={64}
            height={40}
            className="h-10 sm:h-12 w-auto object-contain filter drop-shadow-[0_0_12px_rgba(245,158,11,0.3)] group-hover:scale-105 transition-all duration-300"
          />
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6">
          <Link 
            href="/shop" 
            className={`text-xs font-bold uppercase tracking-wider transition-colors ${
              pathname.startsWith('/shop') ? 'text-amber-400 font-black' : 'text-neutral-300 hover:text-amber-400'
            }`}
          >
            Catalog
          </Link>

          <Link 
            href="/signature-series" 
            className="text-xs font-black uppercase tracking-wider text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/40 px-3.5 py-1.5 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.15)]"
          >
            🔥 Signature Series
          </Link>

          {/* Contractor Tools Dropdown */}
          <div 
            className="relative"
            onMouseEnter={() => setToolsDropdownOpen(true)}
            onMouseLeave={() => setToolsDropdownOpen(false)}
          >
            <button className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors py-2">
              <span>⚡ Pro Tools</span>
              <FiChevronDown className={`w-3.5 h-3.5 transition-transform ${toolsDropdownOpen ? 'rotate-180 text-amber-400' : ''}`} />
            </button>

            {toolsDropdownOpen && (
              <div className="absolute top-full left-0 w-64 bg-neutral-900/95 backdrop-blur-2xl border border-amber-500/30 rounded-2xl p-2.5 shadow-2xl space-y-1 z-popover animate-in fade-in slide-in-from-top-2 duration-150">
                <Link 
                  href="/blade-finder" 
                  onClick={() => setToolsDropdownOpen(false)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-neutral-800/80 text-xs font-bold text-neutral-200 hover:text-amber-400 transition-colors"
                >
                  <FiZap className="text-amber-400" size={16} />
                  <div>
                    <div className="text-white">Blade Spec Finder</div>
                    <div className="text-[10px] text-neutral-500 font-normal">Match saw to material</div>
                  </div>
                </Link>

                <Link 
                  href="/knowledge-test" 
                  onClick={() => setToolsDropdownOpen(false)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-neutral-800/80 text-xs font-bold text-neutral-200 hover:text-amber-400 transition-colors"
                >
                  <FiAward className="text-amber-400" size={16} />
                  <div>
                    <div className="text-white">Certified Quiz</div>
                    <div className="text-[10px] text-neutral-500 font-normal">Test knowledge & save 15%</div>
                  </div>
                </Link>

                <Link 
                  href="/rpm-calculator" 
                  onClick={() => setToolsDropdownOpen(false)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-neutral-800/80 text-xs font-bold text-neutral-200 hover:text-amber-400 transition-colors"
                >
                  <FiSliders className="text-amber-400" size={16} />
                  <div>
                    <div className="text-white">RPM Speed Calculator</div>
                    <div className="text-[10px] text-neutral-500 font-normal">Calculate optimum SFPM</div>
                  </div>
                </Link>

                <Link 
                  href="/blade-comparator" 
                  onClick={() => setToolsDropdownOpen(false)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-neutral-800/80 text-xs font-bold text-neutral-200 hover:text-amber-400 transition-colors"
                >
                  <FiLayers className="text-amber-400" size={16} />
                  <div>
                    <div className="text-white">Blade Spec Comparator</div>
                    <div className="text-[10px] text-neutral-500 font-normal">Side-by-side performance</div>
                  </div>
                </Link>

                <Link 
                  href="/unit-converter" 
                  onClick={() => setToolsDropdownOpen(false)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-neutral-800/80 text-xs font-bold text-neutral-200 hover:text-amber-400 transition-colors"
                >
                  <FiRefreshCw className="text-amber-400" size={16} />
                  <div>
                    <div className="text-white">Segment Unit Converter</div>
                    <div className="text-[10px] text-neutral-500 font-normal">mm, inches, HP to kW</div>
                  </div>
                </Link>
              </div>
            )}
          </div>

          {/* Applications Dropdown */}
          <div 
            className="relative"
            onMouseEnter={() => setAppsDropdownOpen(true)}
            onMouseLeave={() => setAppsDropdownOpen(false)}
          >
            <button className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors py-2">
              <span>Applications</span>
              <FiChevronDown className={`w-3.5 h-3.5 transition-transform ${appsDropdownOpen ? 'rotate-180 text-amber-400' : ''}`} />
            </button>

            {appsDropdownOpen && (
              <div className="absolute top-full left-0 w-56 bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-2.5 shadow-2xl space-y-1 z-popover animate-in fade-in slide-in-from-top-2 duration-150">
                <Link href="/applications/concrete-cutting" onClick={() => setAppsDropdownOpen(false)} className="block p-2 rounded-xl hover:bg-neutral-800 text-xs font-bold text-neutral-200 hover:text-amber-400 transition-colors">
                  Concrete Flat Saws
                </Link>
                <Link href="/applications/core-drilling" onClick={() => setAppsDropdownOpen(false)} className="block p-2 rounded-xl hover:bg-neutral-800 text-xs font-bold text-neutral-200 hover:text-amber-400 transition-colors">
                  Core Drilling Rigs
                </Link>
                <Link href="/applications/asphalt-cutting" onClick={() => setAppsDropdownOpen(false)} className="block p-2 rounded-xl hover:bg-neutral-800 text-xs font-bold text-neutral-200 hover:text-amber-400 transition-colors">
                  Asphalt & Green Concrete
                </Link>
                <Link href="/applications/surface-prep" onClick={() => setAppsDropdownOpen(false)} className="block p-2 rounded-xl hover:bg-neutral-800 text-xs font-bold text-neutral-200 hover:text-amber-400 transition-colors">
                  Surface Prep & Grinding
                </Link>
              </div>
            )}
          </div>

          <Link href="/careers" className="text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors">
            Careers
          </Link>
          <Link href="/contact" className="text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-amber-400 transition-colors">
            Contact
          </Link>
        </nav>

        {/* Right Actions: Login */}
        <div className="flex items-center gap-3">
          <Link 
            href="/login" 
            className="hidden sm:flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-neutral-950 font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.25)] hover:shadow-[0_0_30px_rgba(245,158,11,0.45)] transition-all active:scale-95 border border-amber-400/40"
          >
            <FiLock size={14} /> Contractor Login
          </Link>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
            className="lg:hidden p-2 rounded-xl bg-neutral-900 border border-white/10 text-amber-400 hover:text-white transition-colors"
          >
            {mobileMenuOpen ? <FiX size={22} /> : <FiMenu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-Out Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-neutral-950/98 backdrop-blur-2xl border-b border-amber-500/30 p-6 space-y-6 animate-in slide-in-from-top-4 duration-200">
          <div className="space-y-3">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 block">NAVIGATION</span>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/shop" onClick={() => setMobileMenuOpen(false)} className="p-3 bg-neutral-900 rounded-xl text-xs font-bold text-white hover:text-amber-400">
                📦 Catalog
              </Link>
              <Link href="/signature-series" onClick={() => setMobileMenuOpen(false)} className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl text-xs font-black text-amber-400">
                🔥 Signature Series
              </Link>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-white/10">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 block">CONTRACTOR PRO TOOLS</span>
            <div className="space-y-2">
              <Link href="/blade-finder" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 bg-neutral-900 rounded-xl text-xs font-bold text-white">
                <FiZap className="text-amber-400" /> Blade Spec Finder
              </Link>
              <Link href="/knowledge-test" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 bg-neutral-900 rounded-xl text-xs font-bold text-white">
                <FiAward className="text-amber-400" /> Certified Quiz & 15% Off
              </Link>
              <Link href="/rpm-calculator" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 bg-neutral-900 rounded-xl text-xs font-bold text-white">
                <FiSliders className="text-amber-400" /> Saw Speed & RPM Calculator
              </Link>
              <Link href="/blade-comparator" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 bg-neutral-900 rounded-xl text-xs font-bold text-white">
                <FiLayers className="text-amber-400" /> Blade Spec Comparator
              </Link>
              <Link href="/unit-converter" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 bg-neutral-900 rounded-xl text-xs font-bold text-white">
                <FiRefreshCw className="text-amber-400" /> Segment Unit Converter
              </Link>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-white/10">
            <Link href="/careers" onClick={() => setMobileMenuOpen(false)} className="block p-3 bg-neutral-900 rounded-xl text-xs font-bold text-white">
              💼 Careers & Sales Rep Jobs
            </Link>
            <Link href="/contact" onClick={() => setMobileMenuOpen(false)} className="block p-3 bg-neutral-900 rounded-xl text-xs font-bold text-white">
              ✉️ Contact Sales Support
            </Link>
          </div>

          <div className="pt-4 border-t border-white/10">
            <Link 
              href="/login" 
              onClick={() => setMobileMenuOpen(false)}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-neutral-950 font-black text-xs uppercase tracking-wider py-4 rounded-xl text-center block shadow-lg"
            >
              Contractor Account Login →
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
