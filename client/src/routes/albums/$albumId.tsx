import { createFileRoute } from '@tanstack/react-router';
import { Disc3, Loader2 } from 'lucide-react';
import { AlbumPage } from '@/components/albums/album-page';
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
  const { data: tracks = [] } = useAlbumTracks(albumId);
  const { data: artists = [] } = useArtistsByIds(album?.artists ?? []);

  const isLoading = isAlbumLoading;

  return (
    <div className="pb-32">
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
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
