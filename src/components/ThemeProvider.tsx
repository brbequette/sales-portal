"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('td_theme') as Theme;
    const initialTheme = (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
    setThemeState(initialTheme);
    applyThemeToDOM(initialTheme);
  }, []);

  const applyThemeToDOM = (t: Theme) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const body = document.body;
    
    root.setAttribute('data-theme', t);
    body.setAttribute('data-theme', t);

    if (t === 'light') {
      root.classList.add('light', 'light-mode');
      root.classList.remove('dark', 'dark-mode');
      body.classList.add('light-mode');
      body.classList.remove('dark-mode');
    } else {
      root.classList.add('dark', 'dark-mode');
      root.classList.remove('light', 'light-mode');
      body.classList.add('dark-mode');
      body.classList.remove('light-mode');
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(nextTheme);
    localStorage.setItem('td_theme', nextTheme);
    applyThemeToDOM(nextTheme);
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('td_theme', newTheme);
    applyThemeToDOM(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      <div className={`min-h-screen ${theme === 'light' ? 'light-mode' : 'dark-mode'}`}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
