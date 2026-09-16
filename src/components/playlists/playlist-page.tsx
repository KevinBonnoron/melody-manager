import { ListMusic, Music2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LibraryButton } from '@/components/atoms/library-button';
import { PageHeader } from '@/components/layout/page-header-block';
import { PlayButton } from '@/components/tracks/play-button';
import { TrackTable } from '@/components/tracks/track-table';
import { usePlaylistRatings } from '@/hooks/use-ratings';
import { getPlaylistCoverUrl } from '@/lib/cover-url';
import { formatDuration } from '@/lib/utils';
import type { Playlist, Track } from '@/shared';
import { PlaylistActionsMenu } from './playlist-actions-menu';

interface Props {
  playlist: Playlist;
  tracks: Track[];
}

function usePlaylistName(playlist: Playlist) {
  const { t } = useTranslation();

  if (playlist.type === 'smart') {
    return t(`SmartPlaylist.${playlist.name}`, playlist.name);
  }

  return playlist.name;
}

export function PlaylistPage({ playlist, tracks }: Props) {
  const { t } = useTranslation();
  const { ratingOf, toggleLike, toggleDislike, isReady: ratingsReady } = usePlaylistRatings();
  const coverUrl = getPlaylistCoverUrl(playlist);
  const displayName = usePlaylistName(playlist);
  const totalDuration = tracks.reduce((sum, { duration }) => sum + duration, 0);
  const origin = playlist.origin ?? null;

  return (
    <>
      <PageHeader
        media={<div className="h-full w-full rounded-xl overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shadow-2xl">{coverUrl ? <img src={coverUrl} alt={displayName} className="w-full h-full object-cover" /> : <ListMusic className="h-1/2 w-1/2 text-primary/60" />}</div>}
        title={displayName}
        subtitle={
          <>
            <span>
              {tracks.length} {t('PlaylistPage.tracks', { count: tracks.length })}
            </span>
            <span>·</span>
            <span>{formatDuration(totalDuration, 'long')}</span>
          </>
        }
        description={playlist.description}
        actions={
          <>
            <PlayButton tracks={tracks} label={t('PlaylistPage.play')} />
            {playlist.type !== 'smart' && <LibraryButton value={ratingOf(playlist.id)?.value} ready={ratingsReady} onLike={() => toggleLike(playlist.id)} onUndislike={() => toggleDislike(playlist.id)} />}
          </>
        }
        menu={<PlaylistActionsMenu playlist={playlist} name={displayName} origin={origin ?? undefined} />}
      />

      {tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Music2 className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg">{t('PlaylistPage.noTracks')}</p>
        </div>
      ) : (
        <TrackTable tracks={tracks} />
      )}
    </>
  );
}
