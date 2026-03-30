import type { Album, Artist, Track, TrackPlay } from '@melody-manager/shared';
import { useLiveQuery } from '@tanstack/react-db';
import { ChevronDown, History, Music2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { albumCollection } from '@/collections/album.collection';
import { artistCollection } from '@/collections/artist.collection';
import { trackCollection } from '@/collections/track.collection';
import { trackPlayCollection } from '@/collections/track-play.collection';
import { Button } from '@/components/ui/button';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { formatTimeAgo } from '@/lib/utils';

export function HistoryPage() {
  const { t } = useTranslation();

  const { data: trackPlays = [] } = useLiveQuery((q) => q.from({ trackPlays: trackPlayCollection }));
  const { data: tracks = [] } = useLiveQuery((q) => q.from({ tracks: trackCollection }));
  const { data: albums = [] } = useLiveQuery((q) => q.from({ albums: albumCollection }));
  const { data: artists = [] } = useLiveQuery((q) => q.from({ artists: artistCollection }));

  const trackMap = useMemo(() => new Map((tracks as Track[]).map((tr) => [tr.id, tr])), [tracks]);
  const albumMap = useMemo(() => new Map((albums as Album[]).map((a) => [a.id, a])), [albums]);
  const artistMap = useMemo(() => new Map((artists as Artist[]).map((a) => [a.id, a])), [artists]);

  const recentlyPlayed = useMemo(() => {
    return [...(trackPlays as TrackPlay[])]
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
      .map((p) => ({ play: p, track: trackMap.get(p.track) }))
      .filter((item): item is { play: TrackPlay; track: Track } => !!item.track);
  }, [trackPlays, trackMap]);

  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleItems = recentlyPlayed.slice(0, visibleCount);
  const hasMore = visibleCount < recentlyPlayed.length;

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
    <div className="space-y-1 pb-48">
      {visibleItems.map(({ play, track }) => (
        <HistoryRow key={play.id} play={play} track={track} albumMap={albumMap} artistMap={artistMap} />
      ))}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button variant="ghost" onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)} className="text-muted-foreground hover:text-foreground">
            <ChevronDown className="mr-1 h-4 w-4" />
            {t('LibraryPage.seeMore')}
          </Button>
        </div>
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
      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">{coverUrl ? <img src={coverUrl} alt={track.title} className="h-full w-full object-cover" /> : <Music2 className="h-4 w-4 text-muted-foreground" />}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{track.title}</p>
        <p className="text-xs text-muted-foreground truncate">{artistNames}</p>
      </div>
      <p className="text-xs text-muted-foreground shrink-0">{timeAgo}</p>
    </button>
  );
}
