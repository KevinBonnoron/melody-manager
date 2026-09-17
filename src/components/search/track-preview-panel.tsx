import { CircleAlert, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { TrackPreviewState } from '@/hooks/use-track-previews';
import { cn, formatDuration } from '@/lib/utils';
import { type PreviewSegment, toPreviewSegments } from './track-preview';

interface Props {
  id: string;
  label: string;
  state?: TrackPreviewState;
  className?: string;
  onRetry: () => void;
}

function visibleTiming(segment: PreviewSegment) {
  if (segment.start === null || segment.end === null) {
    return formatDuration(segment.duration);
  }

  return `${formatDuration(segment.start)} – ${formatDuration(segment.end)}`;
}

type Translate = ReturnType<typeof useTranslation>['t'];

function spokenTiming(segment: PreviewSegment, t: Translate) {
  if (segment.start === null || segment.end === null) {
    return t('SearchPage.previewSegmentDuration', { duration: formatDuration(segment.duration, 'long') });
  }

  return t('SearchPage.previewSegmentRange', { start: formatDuration(segment.start, 'long'), end: formatDuration(segment.end, 'long') });
}

export function TrackPreviewPanel({ id, label, state, className, onRetry }: Props) {
  const { t } = useTranslation();
  const segments = state?.status === 'ready' ? toPreviewSegments(state.tracks) : [];

  return (
    <div id={id} className={cn('rounded-lg border border-border bg-muted/20 p-2.5', className)}>
      {(state === undefined || state.status === 'loading') && (
        <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {t('SearchPage.previewLoading')}
        </p>
      )}

      {state?.status === 'error' && (
        <div className="flex items-center gap-2 text-[11.5px] text-destructive">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{t('SearchPage.previewFailed')}</span>
          <Button size="xs" variant="ghost" className="shrink-0" onClick={onRetry}>
            {t('SearchPage.previewRetry')}
          </Button>
        </div>
      )}

      {state?.status === 'ready' && segments.length === 0 && <p className="text-[11.5px] text-muted-foreground">{t('SearchPage.previewEmpty')}</p>}

      {segments.length > 0 && (
        <>
          <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">{t('SearchPage.previewCount', { count: segments.length })}</p>
          <ol aria-label={label} className="space-y-0.5">
            {segments.map((segment) => (
              <li key={segment.key} className="flex items-baseline gap-2 text-[12px]">
                <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground" aria-hidden="true">
                  {segment.position}
                </span>
                <span className="min-w-0 flex-1 truncate">{segment.title}</span>
                <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground" aria-hidden="true">
                  {visibleTiming(segment)}
                </span>
                <span className="sr-only">{spokenTiming(segment, t)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
