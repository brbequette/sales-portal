"use client";

import { useTheme } from './ThemeProvider';
import { FiSun, FiMoon } from 'react-icons/fi';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle Light/Dark Theme"
      className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700/80 text-amber-400 border border-white/10 transition-all flex items-center gap-1.5 text-xs font-bold shadow-sm"
      title={theme === 'dark' ? "Switch to Light Theme" : "Switch to Dark Theme"}
    >
      {theme === 'dark' ? (
        <>
          <FiSun className="w-4 h-4 text-amber-400 animate-spin-slow" />
          <span className="hidden sm:inline text-neutral-300">Light</span>
        </>
      ) : (
        <>
          <FiMoon className="w-4 h-4 text-amber-500" />
          <span className="hidden sm:inline text-neutral-800 font-bold">Dark</span>
        </>
      )}
    </button>
  );
}
