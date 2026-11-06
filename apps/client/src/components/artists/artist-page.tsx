import { useNavigate } from '@tanstack/react-router';
import { Loader2, Play, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { artistCollection } from '@/collections/artist.collection';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useAlbumsForArtist } from '@/hooks/use-album';
import { useArtist } from '@/hooks/use-artists';
import { useAuthUser } from '@/hooks/use-auth-user';
import { useArtistRatings } from '@/hooks/use-ratings';
import { useArtistTracks } from '@/hooks/use-tracks';
import { getArtistCoverUrl } from '@/lib/cover-url';
import { AlbumCard } from '../albums/album-card';
import { LibraryButton } from '../atoms/library-button';
import { PageHeader } from '../layout/page-header-block';
import { Button } from '../ui/button';
import { ArtistActionsMenu } from './artist-actions-menu';

interface Props {
  artistId: string;
}

export function ArtistPage({ artistId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: artist, isLoading } = useArtist(artistId);
  const { data: tracks = [] } = useArtistTracks(artistId);
  const { data: albums = [] } = useAlbumsForArtist(artistId);
  const { ratingOf, toggleLike, toggleDislike, isReady: ratingsReady } = useArtistRatings();
  const { play } = useMusicPlayer();
  const user = useAuthUser();
  const isAdmin = user.role === 'admin';
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const handlePlayAll = () => {
    if (tracks.length > 0) {
      play(tracks);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await artistCollection.delete(artistId).isPersisted.promise;
      toast.success(t('ArtistPage.deleteSuccess', { name: artist?.name }));
      navigate({ to: '/library' });
    } catch {
      toast.error(t('ArtistPage.deleteError'));
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <div>
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : artist ? (
        <>
          <PageHeader
            media={
              <div className="h-full w-full rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shadow-2xl">
                {(() => {
                  const imageUrl = getArtistCoverUrl(artist);
                  return imageUrl ? <img src={imageUrl} alt={artist.name} className="w-full h-full object-cover" /> : <User className="h-1/3 w-1/3 text-primary/60" />;
                })()}
              </div>
            }
            title={artist.name}
            subtitle={
              <>
                {albums.length} {t('ArtistPage.albums', { count: albums.length })} · {tracks.length} {t('ArtistPage.tracks', { count: tracks.length })}
              </>
            }
            description={artist.bio}
            actions={
              <>
                <Button size="icon" className="h-9 w-9 sm:w-auto sm:px-3" onClick={handlePlayAll} disabled={tracks.length === 0}>
                  <Play className="h-4 w-4 sm:mr-2" fill="currentColor" />
                  <span className="hidden sm:inline">{t('ArtistPage.playAll')}</span>
                </Button>
                <LibraryButton value={ratingOf(artist.id)?.value} ready={ratingsReady} onLike={() => toggleLike(artist.id)} onUndislike={() => toggleDislike(artist.id)} />
              </>
            }
            menu={<ArtistActionsMenu artistId={artist.id} name={artist.name} onDelete={isAdmin ? () => setDeleteDialogOpen(true) : undefined} />}
          />

          {albums.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-4">{t('ArtistPage.albumsSectionTitle')}</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 sm:gap-3">
                {albums.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <User className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg">{t('ArtistPage.artistNotFound')}</p>
        </div>
      )}

      {isAdmin && (
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('ArtistPage.deleteConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('ArtistPage.deleteConfirmDescription', { name: artist?.name })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>{t('ArtistPage.cancel')}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? t('ArtistPage.deleting') : t('ArtistPage.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
