import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ACCENTS, type Accent, PROGRESS_SHAPES, type ProgressShape, useTheme, WAVE_STYLES, type WaveStyle } from '@/providers/ThemeProvider';
import { ProgressShapePreview } from './progress-shape-preview';

const MODES = [
  { id: 'light' as const, icon: Sun },
  { id: 'dark' as const, icon: Moon },
  { id: 'system' as const, icon: Monitor },
];

export function AppearanceSettings() {
  const { t } = useTranslation();
  const { theme, setTheme, accent, setAccent, progressShape, setProgressShape, progressCursor, setProgressCursor, waveStyle, setWaveStyle } = useTheme();

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4">
        <h3 className="font-semibold">{t('Appearance.mode')}</h3>
        <div className="flex flex-wrap gap-2">
          {MODES.map(({ id, icon: Icon }) => (
            <Button key={id} type="button" variant={theme === id ? 'default' : 'outline'} size="sm" aria-pressed={theme === id} onClick={() => setTheme(id)}>
              <Icon className="h-4 w-4 mr-1.5" />
              {t(`Appearance.${id}`)}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <h3 className="font-semibold">{t('Appearance.colour')}</h3>
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
      </Card>

      <Card className="space-y-2 p-4">
        <h3 className="font-semibold">{t('Appearance.progress')}</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {PROGRESS_SHAPES.map((id: ProgressShape) => (
            <div key={id} className={cn('group relative flex flex-col rounded-lg border transition-colors', progressShape === id ? 'border-primary bg-primary-soft' : 'border-border hover:border-muted-foreground/40')}>
              <button type="button" aria-pressed={progressShape === id} aria-label={t(`Appearance.progressShapes.${id}`)} onClick={() => setProgressShape(id)} className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
              <div className={cn('pointer-events-none relative flex flex-1 flex-col items-start gap-2 p-3', progressShape === id ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')}>
                <ProgressShapePreview shape={id} waveStyle={waveStyle} cursor={progressCursor} />
                <span className="text-[13px] font-medium text-foreground">{t(`Appearance.progressShapes.${id}`)}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">{t(`Appearance.progressAbout.${id}`)}</span>
              </div>
              {id === 'wave' && (
                <div className="pointer-events-none relative flex gap-1 border-t border-inherit px-3 py-2">
                  {WAVE_STYLES.map((style: WaveStyle) => (
                    <Button
                      key={style}
                      type="button"
                      size="xs"
                      className="pointer-events-auto"
                      variant={progressShape === 'wave' && waveStyle === style ? 'default' : 'outline'}
                      aria-pressed={progressShape === 'wave' && waveStyle === style}
                      onClick={() => {
                        setWaveStyle(style);
                        setProgressShape('wave');
                      }}
                    >
                      {t(`Appearance.waveStyles.${style}`)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className={cn('flex items-center justify-between gap-3 rounded-lg border border-border p-3', progressShape === 'plain' && 'opacity-50')}>
          <div className="min-w-0">
            <Label htmlFor="progress-cursor" className="text-[13px] font-medium">
              {t('Appearance.progressCursor')}
            </Label>
            <p className="text-[11px] leading-snug text-muted-foreground">{progressShape === 'plain' ? t('Appearance.progressCursorPlain') : t('Appearance.progressCursorAbout')}</p>
          </div>
          <Switch id="progress-cursor" checked={progressCursor} onCheckedChange={setProgressCursor} disabled={progressShape === 'plain'} />
        </div>
      </Card>
    </div>
  );
}
