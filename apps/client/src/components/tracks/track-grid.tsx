import { Music2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CardGrid } from '@/components/atoms/card-grid';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useNowPlaying } from '@/hooks/use-now-playing';
import type { Track, TrackProvider } from '@/shared';
import { TrackCard } from './track-card';

interface Props {
  tracks: Track[];
  provider: TrackProvider | 'all';
}

export function TrackGrid({ tracks, provider }: Props) {
  const { t } = useTranslation();
  const { play, togglePlayPause, currentTrack, isLoading } = useMusicPlayer();
  const { track: nowPlaying, isPlaying } = useNowPlaying();
  const filteredTracks = useMemo(() => (provider === 'all' ? tracks : tracks.filter((track) => track.source === provider.type)), [tracks, provider]);
  const playableTracks = useMemo(() => filteredTracks.filter((track) => track.availability !== 'none'), [filteredTracks]);
  const handlePlayTrack = useCallback(
    (track: Track) => {
      if (track.availability === 'none') {
        return;
      }

      if (currentTrack?.id === track.id) {
        togglePlayPause();
      } else {
        play([track, ...playableTracks.filter((other) => other.id !== track.id)]);
      }
    },
    [playableTracks, currentTrack, play, togglePlayPause],
  );

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
    <CardGrid items={filteredTracks} getKey={(track) => track.id} className="gap-2 sm:gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]" fallbackHeight={246}>
      {(track) => <TrackCard track={track} onPlay={handlePlayTrack} isPlaying={nowPlaying?.id === track.id && isPlaying} isLoading={currentTrack?.id === track.id && isLoading} />}
    </CardGrid>
  );
}
