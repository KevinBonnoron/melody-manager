import { inArray, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute } from '@tanstack/react-router';
import { ListMusic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { trackCollection } from '@/collections/track.collection';
import { PlaylistPage } from '@/components/playlists/playlist-page';
import { usePlaylist } from '@/hooks/use-playlists';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/playlists/$playlistId')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { playlistId } = Route.useParams();
  const { data: playlist, isLoading: isPlaylistLoading } = usePlaylist(playlistId);
  const trackIds = playlist?.tracks ?? [];
  const { data: tracks = [], isLoading: isTracksLoading } = useLiveQuery((q) => q.from({ tracks: trackCollection }).where(({ tracks }) => inArray(tracks.id, trackIds.length > 0 ? trackIds : [''])), [trackIds.join(',')]);
  const isLoading = isPlaylistLoading || isTracksLoading;

  return (
    <div>
      {isLoading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-32 w-32 rounded-xl bg-muted" />
          <div className="h-8 w-64 rounded bg-muted" />
        </div>
      ) : playlist ? (
        <PlaylistPage playlist={playlist} tracks={tracks} />
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <ListMusic className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg">{t('PlaylistPage.notFound')}</p>
        </div>
      )}
    </div>
  );
}
