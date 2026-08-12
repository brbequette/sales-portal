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

const customColorVariables: Record<string, string> = {
  primary: '--primary',
  primaryHover: '--primary-hover',
  background: '--background',
  surface: '--surface',
  surface2: '--surface-2',
  foreground: '--foreground',
  muted: '--muted',
  border: '--border',
  success: '--success',
  warning: '--warning',
  danger: '--danger',
  info: '--info',
};

function applySavedColors() {
  try {
    const saved = localStorage.getItem('titan_theme_settings');
    if (!saved) return;
    const colors = JSON.parse(saved) as Record<string, string>;
    Object.entries(customColorVariables).forEach(([key, variable]) => {
      if (colors[key]) document.documentElement.style.setProperty(variable, colors[key]);
    });
  } catch {}
}

function clearSavedColors() {
  Object.values(customColorVariables).forEach(variable => {
    document.documentElement.style.removeProperty(variable);
  });
}

function applyThemeToDOM(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;

  root.setAttribute('data-theme', theme);
  body.setAttribute('data-theme', theme);

  if (theme === 'light') {
    clearSavedColors();
    root.classList.add('light', 'light-mode');
    root.classList.remove('dark', 'dark-mode');
    body.classList.add('light-mode');
    body.classList.remove('dark-mode');
  } else {
    root.classList.add('dark', 'dark-mode');
    root.classList.remove('light', 'light-mode');
    body.classList.add('dark-mode');
    body.classList.remove('light-mode');
    applySavedColors();
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('td_theme') as Theme;
    const initialTheme = (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
    applyThemeToDOM(initialTheme);
    queueMicrotask(() => setThemeState(initialTheme));
  }, []);

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
