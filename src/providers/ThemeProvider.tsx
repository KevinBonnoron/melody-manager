import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

// The colour the interface is built around. Everything tinted derives from
// --primary, so a theme is one variable and the rest follows: buttons, rings,
// the sidebar mark, the scrollbar.
export const ACCENTS = ['violet', 'emerald', 'amber', 'rose', 'sky'] as const;
export type Accent = (typeof ACCENTS)[number];

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  accent: Accent;
  setAccent: (accent: Accent) => void;
};

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  accent: 'violet',
  setAccent: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);
export function ThemeProvider({ children, defaultTheme = 'system', storageKey = 'melody-manager-theme', ...props }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(storageKey) as Theme) || defaultTheme);
  const [accent, setAccent] = useState<Accent>(() => {
    const stored = localStorage.getItem(`${storageKey}-accent`) as Accent | null;
    return stored && ACCENTS.includes(stored) ? stored : 'violet';
  });

  useEffect(() => {
    window.document.documentElement.dataset.accent = accent;
  }, [accent]);
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.add('disable-transitions');
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('disable-transitions');
      });
    });
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
    accent,
    setAccent: (accent: Accent) => {
      localStorage.setItem(`${storageKey}-accent`, accent);
      setAccent(accent);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};
