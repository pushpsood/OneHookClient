import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'onehook_app_theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

// Global listeners for reactive theme changes across app components
type ThemeListener = (theme: Theme, resolved: ResolvedTheme) => void;
const listeners = new Set<ThemeListener>();

let currentTheme: Theme = typeof window !== 'undefined' ? getStoredTheme() : 'system';
let currentResolved: ResolvedTheme = typeof window !== 'undefined' ? resolveTheme(currentTheme) : 'light';

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'system') {
      currentResolved = getSystemTheme();
      listeners.forEach((l) => l(currentTheme, currentResolved));
    }
  });
}

export function setAppTheme(newTheme: Theme) {
  currentTheme = newTheme;
  currentResolved = resolveTheme(newTheme);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, newTheme);
  }
  listeners.forEach((l) => l(currentTheme, currentResolved));
}

export function toggleAppTheme() {
  const next = currentResolved === 'dark' ? 'light' : 'dark';
  setAppTheme(next);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(currentTheme);
  const [resolvedTheme, setResolvedState] = useState<ResolvedTheme>(currentResolved);

  useEffect(() => {
    const listener: ThemeListener = (t, r) => {
      setThemeState(t);
      setResolvedState(r);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    theme,
    resolvedTheme,
    setTheme: setAppTheme,
    toggleTheme: toggleAppTheme,
    isDark: resolvedTheme === 'dark',
  };
}
