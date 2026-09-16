import { useLiveQuery } from '@tanstack/react-db';
import { History, Music2, Play, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { albumCollection } from '@/collections/album.collection';
import { artistCollection } from '@/collections/artist.collection';
import { trackCollection } from '@/collections/track.collection';
import { trackPlayCollection } from '@/collections/track-play.collection';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { getSourceColor } from '@/lib/source-colors';
import { cn, formatTimeAgo } from '@/lib/utils';
import type { Album, Artist, Track, TrackPlay } from '@/shared';

type TimeBucket = 'today' | 'week' | 'month' | 'older';
type PeriodFilter = 'all' | 'today' | 'week' | 'month';

function getTimeBucket(date: Date, now: Date): TimeBucket {
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  if (diff < dayMs && date.getDate() === now.getDate()) {
    return 'today';
  }

  if (diff < 7 * dayMs) {
    return 'week';
  }

  if (diff < 30 * dayMs) {
    return 'month';
  }

  return 'older';
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }

  return `${minutes}m`;
}

export function HistoryPage() {
  const { t } = useTranslation();
  const { data: trackPlays = [] } = useLiveQuery({ query: (q) => q.from({ trackPlays: trackPlayCollection }) });
  const { data: tracks = [] } = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }) });
  const { data: albums = [] } = useLiveQuery({ query: (q) => q.from({ albums: albumCollection }) });
  const { data: artists = [] } = useLiveQuery({ query: (q) => q.from({ artists: artistCollection }) });

  const trackMap = useMemo(() => new Map((tracks as Track[]).map((tr) => [tr.id, tr])), [tracks]);
  const albumMap = useMemo(() => new Map((albums as Album[]).map((a) => [a.id, a])), [albums]);
  const artistMap = useMemo(() => new Map((artists as Artist[]).map((a) => [a.id, a])), [artists]);

  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [query, setQuery] = useState('');

  const now = useMemo(() => new Date(), []);

  const recentlyPlayed = useMemo(() => {
    return [...(trackPlays as TrackPlay[])]
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
      .map((p) => {
        const track = trackMap.get(p.track);
        if (!track) {
          return null;
        }

        return { play: p, track, providerType: track.source || 'unknown', bucket: getTimeBucket(new Date(p.created), now) };
      })
      .filter(Boolean) as { play: TrackPlay; track: Track; providerType: string; bucket: TimeBucket }[];
  }, [trackPlays, trackMap, now]);

  const totalPlays = recentlyPlayed.length;
  const totalDuration = useMemo(() => recentlyPlayed.reduce((sum, item) => sum + (item.track.duration ?? 0), 0), [recentlyPlayed]);

  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of recentlyPlayed) {
      counts[item.providerType] = (counts[item.providerType] ?? 0) + 1;
    }

    return counts;
  }, [recentlyPlayed]);

  const providerTypes = useMemo(() => Object.keys(breakdown).sort((a, b) => breakdown[b] - breakdown[a]), [breakdown]);

  const filtered = useMemo(() => {
    return recentlyPlayed.filter((item) => {
      if (sourceFilter !== 'all' && item.providerType !== sourceFilter) {
        return false;
      }

      if (periodFilter !== 'all') {
        const bucketMatch: Record<PeriodFilter, TimeBucket[]> = {
          all: [],
          today: ['today'],
          week: ['today', 'week'],
          month: ['today', 'week', 'month'],
        };

        if (!bucketMatch[periodFilter].includes(item.bucket)) {
          return false;
        }
      }

      if (query.trim()) {
        const q = query.toLowerCase();
        const artistNames = item.track.artists.map((id) => artistMap.get(id)?.name?.toLowerCase() ?? '').join(' ');

        if (!item.track.title.toLowerCase().includes(q) && !artistNames.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [recentlyPlayed, sourceFilter, periodFilter, query, artistMap]);

  const grouped = useMemo(() => {
    const order: TimeBucket[] = ['today', 'week', 'month', 'older'];
    const labels: Record<TimeBucket, string> = {
      today: t('HistoryPage.today'),
      week: t('HistoryPage.thisWeek'),
      month: t('HistoryPage.thisMonth'),
      older: t('HistoryPage.older'),
    };
    const groups: Record<string, typeof filtered> = {};

    for (const item of filtered) {
      if (!groups[item.bucket]) {
        groups[item.bucket] = [];
      }

      groups[item.bucket].push(item);
    }

    return order.filter((k) => groups[k]).map((k) => ({ key: k, label: labels[k], items: groups[k] }));
  }, [filtered, t]);

  const periods: { id: PeriodFilter; label: string }[] = [
    { id: 'all', label: t('HistoryPage.allPeriods') },
    { id: 'today', label: t('HistoryPage.today') },
    { id: 'week', label: t('HistoryPage.7days') },
    { id: 'month', label: t('HistoryPage.30days') },
  ];

  if (recentlyPlayed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="rounded-full bg-muted p-6 mb-6">
          <History className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold mb-2">{t('HistoryPage.emptyTitle')}</h3>
        <p className="text-muted-foreground mb-6 max-w-md">{t('HistoryPage.emptyDescription')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[auto_auto_1fr] gap-6 sm:gap-7 items-center rounded-xl border bg-card/50 p-4 sm:p-5">
        <div>
          <div className="text-3xl font-bold tabular-nums leading-none">{totalPlays}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1.5">{t('HistoryPage.plays')}</div>
        </div>

        <div>
          <div className="text-3xl font-bold tabular-nums leading-none">{formatDuration(totalDuration)}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1.5">{t('HistoryPage.totalDuration')}</div>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('HistoryPage.bySource')}</div>

          <div className="flex h-2 rounded-full overflow-hidden bg-muted">
            {providerTypes.map((type) => {
              const pct = totalPlays > 0 ? (breakdown[type] / totalPlays) * 100 : 0;
              if (pct === 0) {
                return null;
              }

              return (
                <button
                  type="button"
                  key={type}
                  className={cn('transition-all cursor-pointer hover:brightness-110', sourceFilter === type && 'ring-1 ring-inset ring-white/40')}
                  style={{ width: `${pct}%`, backgroundColor: getSourceColor(type) }}
                  onClick={() => setSourceFilter(sourceFilter === type ? 'all' : type)}
                  title={`${type} · ${breakdown[type]}`}
                />
              );
            })}
          </div>

          <div className="flex gap-3 flex-wrap items-center">
            {providerTypes.map((type) => (
              <button
                type="button"
                key={type}
                className={cn('inline-flex items-center gap-1.5 text-[11px] transition-opacity', sourceFilter !== 'all' && sourceFilter !== type ? 'opacity-40' : '', sourceFilter === type ? 'font-medium' : 'text-muted-foreground')}
                onClick={() => setSourceFilter(sourceFilter === type ? 'all' : type)}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getSourceColor(type) }} />
                <span className="capitalize">{type}</span>
                <span className="tabular-nums text-muted-foreground">{breakdown[type]}</span>
              </button>
            ))}

            {sourceFilter !== 'all' && (
              <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground ml-auto rounded-full bg-muted px-2 py-0.5 hover:bg-muted/80" onClick={() => setSourceFilter('all')}>
                <X className="h-3 w-3" />
                {t('HistoryPage.showAll')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-card/50 px-3 py-2 flex-1 sm:max-w-sm">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input className="bg-transparent text-sm outline-none flex-1 min-w-0 placeholder:text-muted-foreground" placeholder={t('HistoryPage.filterHistory')} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setQuery('')}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="inline-flex rounded-lg border bg-card/50 p-0.5 gap-0">
          {periods.map((p) => (
            <button type="button" key={p.id} className={cn('px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all', periodFilter === p.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')} onClick={() => setPeriodFilter(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground text-sm border border-dashed rounded-xl">{t('HistoryPage.noResults')}</div>
      ) : (
        grouped.map((group) => (
          <section key={group.key} className="space-y-1">
            <header className="flex items-baseline gap-2.5 pb-2.5 border-b mb-1">
              <h3 className="text-sm font-semibold">{group.label}</h3>
              <span className="text-[11px] text-muted-foreground tabular-nums">{group.items.length}</span>
            </header>

            {group.items.map(({ play, track }) => (
              <HistoryRow key={play.id} play={play} track={track} albumMap={albumMap} artistMap={artistMap} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function HistoryRow({ play, track, albumMap, artistMap }: { play: TrackPlay; track: Track; albumMap: Map<string, Album>; artistMap: Map<string, Artist> }) {
  const { t } = useTranslation();
  const { playTrack, togglePlayPause, currentTrack, setQueue } = useMusicPlayer();
  const album = albumMap.get(track.album);
  const coverUrl = album ? getAlbumCoverUrl(album) : undefined;
  const artistNames = track.artists
    .map((id) => artistMap.get(id)?.name)
    .filter(Boolean)
    .join(', ');
  const isCurrentTrack = currentTrack?.id === track.id;
  const { value, unit } = formatTimeAgo(new Date(play.created));
  const timeAgo = unit === 'now' ? t('HistoryPage.justNow') : t(`HistoryPage.${unit}Ago`, { count: value });

  const handleClick = () => {
    if (isCurrentTrack) {
      togglePlayPause();
    } else {
      setQueue([track]);
      playTrack(track);
    }
  };

  return (
    <button type="button" className="flex items-center gap-3 group cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors w-full text-left" onClick={handleClick}>
      <div className="h-11 w-11 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0 relative">
        {coverUrl ? <img src={coverUrl} alt={track.title} className="h-full w-full object-cover" /> : <Music2 className="h-4 w-4 text-muted-foreground" />}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
          <Play className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium truncate">{track.title}</p>
        <p className="text-xs text-muted-foreground truncate">{artistNames}</p>
      </div>

      <p className="text-xs text-muted-foreground shrink-0 tabular-nums">{timeAgo}</p>
    </button>
  );
}
