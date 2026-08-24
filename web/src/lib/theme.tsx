import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ThemeChoice } from './types';

/**
 * Light, dark, or whatever the phone is doing.
 *
 * Kept on the device rather than the account: a theme belongs to the screen you
 * are looking at, and someone on a laptop by day and a phone at night wants
 * different answers on each.
 */
const KEY = 'pantry.theme';

interface ThemeState {
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeState>({ theme: 'system', setTheme: () => {} });

function apply(theme: ThemeChoice) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(
    () => (localStorage.getItem(KEY) as ThemeChoice) || 'system',
  );

  useEffect(() => {
    apply(theme);
  }, [theme]);

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      setTheme: (next) => {
        localStorage.setItem(KEY, next);
        setThemeState(next);
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
