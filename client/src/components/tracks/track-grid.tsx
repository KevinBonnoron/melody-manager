import { useMusicPlayer } from '@/contexts/music-player-context';
import type { Track, TrackProvider } from '@melody-manager/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Music2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrackCard } from './track-card';

interface Props {
  tracks: Track[];
  provider: TrackProvider | 'all';
}

export function TrackGrid({ tracks, provider }: Props) {
  const { t } = useTranslation();
  const { playTrack, togglePlayPause, currentTrack, isPlaying, isLoading, setQueue } = useMusicPlayer();
  const [columns, setColumns] = useState(4);
  const parentRef = useRef<HTMLDivElement>(null);

  const filteredTracks = useMemo(() => (provider === 'all' ? tracks : tracks.filter((track) => track.provider === provider.id)), [tracks, provider]);

  const handlePlayTrack = useCallback(
    (track: Track) => {
      if (currentTrack?.id === track.id) {
        togglePlayPause();
      } else {
        setQueue(filteredTracks);
        playTrack(track);
      }
    },
    [filteredTracks, currentTrack, setQueue, playTrack, togglePlayPause],
  );

  // Calculate number of columns based on screen width
  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width < 768)
        setColumns(1); // mobile
      else if (width < 1024)
        setColumns(2); // md
      else if (width < 1280)
        setColumns(3); // lg
      else setColumns(4); // xl
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  // Group tracks into rows
  const rows = useMemo(() => {
    const result: Track[][] = [];
    for (let i = 0; i < filteredTracks.length; i += columns) {
      result.push(filteredTracks.slice(i, i + columns));
    }
    return result;
  }, [filteredTracks, columns]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Estimated height of a row
    overscan: 3,
  });

  if (filteredTracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Music2 className="h-16 w-16 mb-4 opacity-20" />
        <p className="text-lg">{t('TrackGrid.noTracksFound')}</p>
        <p className="text-sm">{provider === 'all' ? t('TrackGrid.addMusicToGetStarted') : t('TrackGrid.noTracksFromProvider', { provider: provider.type })}</p>
      </div>
    );
  }

  return (
    <div ref={parentRef}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
                {row.map((track) => (
                  <TrackCard key={track.id} track={track} onPlay={handlePlayTrack} isPlaying={currentTrack?.id === track.id && isPlaying} isLoading={currentTrack?.id === track.id && isLoading} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
