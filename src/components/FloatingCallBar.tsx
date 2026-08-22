"use client";

import { FiPhone, FiMessageSquare, FiShield } from 'react-icons/fi';

export function FloatingCallBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/95 backdrop-blur-xl border-t border-amber-500/30 py-2.5 px-4 md:hidden shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
      <div className="max-w-md mx-auto flex items-center justify-between gap-3">
        <a 
          href="tel:14804702577"
          className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 active:scale-95 text-neutral-950 font-black text-xs uppercase tracking-wider py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md"
        >
          <FiPhone className="animate-bounce" size={16} /> Call Sales (480) 470-2577
        </a>
        <a 
          href="/contact" 
          className="bg-neutral-900 active:scale-95 text-amber-400 border border-amber-500/40 text-xs font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5"
        >
          <FiMessageSquare size={16} /> Quote
        </a>
      </div>
    </div>
  );
}
