import type { Playlist, Track } from '@melody-manager/shared';
import { Check, ExternalLink, Library, ListMusic, Music2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TrackTable } from '@/components/tracks/track-table';
import { PlayButton } from '@/components/tracks/play-button';
import { Button } from '@/components/ui/button';
import { usePlaylistLikes } from '@/hooks/use-playlist-likes';
import { getPlaylistCoverUrl } from '@/lib/cover-url';
import { formatDuration } from '@/lib/utils';

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
  const { isLiked, toggleLike } = usePlaylistLikes();
  const coverUrl = getPlaylistCoverUrl(playlist);
  const displayName = usePlaylistName(playlist);
  const totalDuration = tracks.reduce((sum, { duration }) => sum + duration, 0);
  const sourceUrl = playlist.sourceUrl ?? null;

  return (
    <>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 xl:gap-x-8 xl:gap-y-4 mb-8">
        <div className="row-span-2">
          <div className="w-32 h-32 xl:w-64 xl:h-64 rounded-xl overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shadow-2xl">
            {coverUrl ? <img src={coverUrl} alt={displayName} className="w-full h-full object-cover" /> : <ListMusic className="h-16 w-16 xl:h-32 xl:w-32 text-primary/60" />}
          </div>
        </div>

        <div className="flex flex-col justify-end">
          <h1 className="text-2xl xl:text-4xl font-bold leading-tight line-clamp-2">{displayName}</h1>
          {playlist.description && <p className="text-base xl:text-lg text-muted-foreground mt-1 line-clamp-2">{playlist.description}</p>}
          <p className="text-sm text-muted-foreground mt-1">
            {tracks.length} {t('PlaylistPage.tracks', { count: tracks.length })} · {formatDuration(totalDuration, 'long')}
          </p>
        </div>

        <div className="col-span-2 xl:col-span-1 flex flex-wrap items-center gap-3 xl:gap-4">
          <PlayButton tracks={tracks} label={t('PlaylistPage.play')} />
          {playlist.type !== 'smart' && (
            <Button variant={isLiked(playlist.id) ? 'secondary' : 'outline'} size="icon" className="sm:w-auto sm:px-3 h-9 w-9" onClick={() => toggleLike(playlist.id)} aria-label={isLiked(playlist.id) ? t('PlaylistPage.inLibrary') : t('PlaylistPage.addToLibrary')}>
              {isLiked(playlist.id) ? <Check className="h-4 w-4 sm:mr-2" /> : <Library className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">{isLiked(playlist.id) ? t('PlaylistPage.inLibrary') : t('PlaylistPage.addToLibrary')}</span>
            </Button>
          )}
          {sourceUrl && (
            <Button variant="ghost" size="icon" className="sm:w-auto sm:px-3 h-9 w-9" asChild>
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" title={t('PlaylistPage.openExternal')} aria-label={t('PlaylistPage.openExternal')}>
                <ExternalLink className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('PlaylistPage.openExternal')}</span>
              </a>
            </Button>
          )}
        </div>
      </div>

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
