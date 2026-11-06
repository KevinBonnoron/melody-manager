import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

type Resolved = 'dark' | 'light';

const DARK = '(prefers-color-scheme: dark)';

export const ACCENTS = ['violet', 'fuchsia', 'rose', 'orange', 'amber', 'lime', 'emerald', 'cyan', 'sky'] as const;
export type Accent = (typeof ACCENTS)[number];

export const PROGRESS_SHAPES = ['bars', 'columns', 'wave', 'plain'] as const;
export type ProgressShape = (typeof PROGRESS_SHAPES)[number];

export const WAVE_STYLES = ['filled', 'stroked'] as const;
export type WaveStyle = (typeof WAVE_STYLES)[number];

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: Resolved;
  setTheme: (theme: Theme) => void;
  accent: Accent;
  setAccent: (accent: Accent) => void;
  progressShape: ProgressShape;
  setProgressShape: (shape: ProgressShape) => void;
  progressCursor: boolean;
  setProgressCursor: (shown: boolean) => void;
  waveStyle: WaveStyle;
  setWaveStyle: (style: WaveStyle) => void;
};

const initialState: ThemeProviderState = {
  theme: 'system',
  resolvedTheme: 'dark',
  setTheme: () => null,
  accent: 'violet',
  setAccent: () => null,
  progressShape: 'bars',
  setProgressShape: () => null,
  progressCursor: true,
  setProgressCursor: () => null,
  waveStyle: 'filled',
  setWaveStyle: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);
export function ThemeProvider({ children, defaultTheme = 'system', storageKey = 'melody-manager-theme', ...props }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(storageKey) as Theme) || defaultTheme);
  const [accent, setAccent] = useState<Accent>(() => {
    const stored = localStorage.getItem(`${storageKey}-accent`) as Accent | null;
    return stored && ACCENTS.includes(stored) ? stored : 'violet';
  });

  const [progressShape, setProgressShape] = useState<ProgressShape>(() => {
    const stored = localStorage.getItem(`${storageKey}-progress`) as ProgressShape | null;
    return stored && PROGRESS_SHAPES.includes(stored) ? stored : 'bars';
  });

  const [progressCursor, setProgressCursor] = useState<boolean>(() => localStorage.getItem(`${storageKey}-cursor`) !== 'off');

  const [waveStyle, setWaveStyle] = useState<WaveStyle>(() => {
    const stored = localStorage.getItem(`${storageKey}-wave`) as WaveStyle | null;
    return stored && WAVE_STYLES.includes(stored) ? stored : 'filled';
  });

  useEffect(() => {
    window.document.documentElement.dataset.accent = accent;
  }, [accent]);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK).matches);
  useEffect(() => {
    const query = window.matchMedia(DARK);
    const follow = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', follow);
    setSystemDark(query.matches);
    return () => {
      query.removeEventListener('change', follow);
    };
  }, []);

  const resolved: Resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.add('disable-transitions');
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('disable-transitions');
      });
    });
  }, [resolved]);

  const value = {
    theme,
    resolvedTheme: resolved,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
    accent,
    setAccent: (accent: Accent) => {
      localStorage.setItem(`${storageKey}-accent`, accent);
      setAccent(accent);
    },
    progressShape,
    setProgressShape: (shape: ProgressShape) => {
      localStorage.setItem(`${storageKey}-progress`, shape);
      setProgressShape(shape);
    },
    progressCursor,
    setProgressCursor: (shown: boolean) => {
      localStorage.setItem(`${storageKey}-cursor`, shown ? 'on' : 'off');
      setProgressCursor(shown);
    },
    waveStyle,
    setWaveStyle: (style: WaveStyle) => {
      localStorage.setItem(`${storageKey}-wave`, style);
      setWaveStyle(style);
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
