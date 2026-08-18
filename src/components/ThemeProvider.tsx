"use client";

import React, { createContext, useContext, useEffect } from 'react';

type Theme = 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});

function applyPermanentDarkTheme() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;

  // Persist dark theme permanently
  localStorage.setItem('td_theme', 'dark');

  root.setAttribute('data-theme', 'dark');
  body.setAttribute('data-theme', 'dark');

  root.classList.add('dark', 'dark-mode');
  root.classList.remove('light', 'light-mode');
  body.classList.add('dark-mode');
  body.classList.remove('light-mode');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyPermanentDarkTheme();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'dark', toggleTheme: () => {}, setTheme: () => {} }}>
      <div className="min-h-screen dark-mode bg-neutral-950 text-white">
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
