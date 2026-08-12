"use client";

import { useTheme } from './ThemeProvider';
import { FiSun, FiMoon } from 'react-icons/fi';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle Light/Dark Theme"
      className={`px-3 py-2 rounded-xl transition-all duration-300 flex items-center gap-2 text-xs font-black uppercase tracking-wider border shadow-md active:scale-95 cursor-pointer ${
        theme === 'dark'
          ? 'bg-neutral-900 hover:bg-neutral-800 text-amber-400 border-amber-500/30 hover:border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
          : 'bg-white hover:bg-slate-100 text-amber-600 border-amber-500/40 shadow-sm'
      }`}
      title={theme === 'dark' ? "Switch to Light Theme" : "Switch to Dark Theme"}
    >
      {theme === 'dark' ? (
        <>
          <FiSun className="w-4 h-4 text-amber-400 animate-spin-slow" />
          <span className="text-amber-300">Light</span>
        </>
      ) : (
        <>
          <FiMoon className="w-4 h-4 text-amber-600" />
          <span className="text-slate-800">Dark</span>
        </>
      )}
    </button>
  );
}
