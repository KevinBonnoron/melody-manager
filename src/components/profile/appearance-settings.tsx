import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ACCENTS, type Accent, useTheme } from '@/providers/ThemeProvider';

const MODES = [
  { id: 'light' as const, icon: Sun },
  { id: 'dark' as const, icon: Moon },
  { id: 'system' as const, icon: Monitor },
];

// The swatch shows the theme it applies, so it has to be painted with that
// theme's own colour rather than the one in force: data-accent on the swatch
// itself resolves --primary to the right value.
export function AppearanceSettings() {
  const { t } = useTranslation();
  const { theme, setTheme, accent, setAccent } = useTheme();

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">{t('Appearance.title')}</h3>

      <div className="space-y-2">
        <Label>{t('Appearance.mode')}</Label>
        <div className="flex flex-wrap gap-2">
          {MODES.map(({ id, icon: Icon }) => (
            <Button key={id} type="button" variant={theme === id ? 'default' : 'outline'} size="sm" onClick={() => setTheme(id)}>
              <Icon className="h-4 w-4 mr-1.5" />
              {t(`Appearance.${id}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('Appearance.colour')}</Label>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((value: Accent) => (
            <button
              key={value}
              type="button"
              data-accent={value}
              aria-label={t(`Appearance.accents.${value}`)}
              title={t(`Appearance.accents.${value}`)}
              aria-pressed={accent === value}
              onClick={() => setAccent(value)}
              className={cn('grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground ring-offset-2 ring-offset-background transition-transform hover:scale-105', accent === value && 'ring-2 ring-foreground')}
            >
              {accent === value && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
