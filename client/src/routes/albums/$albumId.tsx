import { createFileRoute } from '@tanstack/react-router';
import { Disc3 } from 'lucide-react';
import { AlbumPage } from '@/components/albums/album-page';
import { AlbumPageSkeleton } from '@/components/albums/album-page-skeleton';
import { useAlbum } from '@/hooks/use-album';
import { useArtistsByIds } from '@/hooks/use-artists';
import { useAlbumTracks } from '@/hooks/use-tracks';
import { authGuard } from '@/lib/auth-guard';

export const Route = createFileRoute('/albums/$albumId')({
  beforeLoad: authGuard,
  component: RouteComponent,
});

function RouteComponent() {
  const { albumId } = Route.useParams();
  const { data: album, isLoading: isAlbumLoading } = useAlbum(albumId);
  const { data: tracks = [], isLoading: isTracksLoading } = useAlbumTracks(albumId);
  const { data: artists = [], isLoading: isArtistsLoading } = useArtistsByIds(album?.artists ?? []);

  const isLoading = isAlbumLoading || isTracksLoading || isArtistsLoading;

  return (
    <div className="pb-32">
      {isLoading ? (
        <AlbumPageSkeleton />
      ) : album ? (
        <AlbumPage album={album} tracks={tracks} artists={artists} />
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Disc3 className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg">Album not found</p>
        </div>
      )}
    </div>
  );
}
