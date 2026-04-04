import { useNavigate } from '@tanstack/react-router';
import { Check, Loader2, Play, Trash2, User, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { artistsClient } from '@/clients/artists.client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useAlbumsForArtist } from '@/hooks/use-album';
import { useArtistLikes } from '@/hooks/use-artist-likes';
import { useArtist } from '@/hooks/use-artists';
import { useAuthUser } from '@/hooks/use-auth-user';
import { useArtistTracks } from '@/hooks/use-tracks';
import { getArtistImageUrl } from '@/lib/cover-url';
import { AlbumCard } from '../albums/album-card';
import { Button } from '../ui/button';

interface Props {
  artistId: string;
}

export function ArtistPage({ artistId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: artist, isLoading } = useArtist(artistId);
  const { data: tracks = [] } = useArtistTracks(artistId);
  const { data: albums = [] } = useAlbumsForArtist(artistId);
  const { isLiked, toggleLike } = useArtistLikes();
  const { playTrack, setQueue } = useMusicPlayer();
  const user = useAuthUser();
  const isAdmin = user.role === 'admin';
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const handlePlayAll = () => {
    if (tracks.length > 0) {
      setQueue(tracks);
      playTrack(tracks[0]);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await artistsClient.delete(artistId);
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
          <div className="flex flex-col md:flex-row gap-8 mb-8">
            <div className="flex-shrink-0">
              <div className="w-24 h-24 md:w-32 md:h-32 xl:w-40 xl:h-40 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shadow-2xl">
                {(() => {
                  const imageUrl = getArtistImageUrl(artist);
                  return imageUrl ? <img src={imageUrl} alt={artist.name} className="w-full h-full object-cover" /> : <User className="h-10 w-10 md:h-14 md:w-14 xl:h-16 xl:w-16 text-primary/60" />;
                })()}
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-end">
              <p className="text-sm text-muted-foreground mb-2">{t('ArtistPage.artistLabel')}</p>
              <h1 className="text-3xl md:text-4xl xl:text-5xl font-bold mb-4">{artist.name}</h1>
              {artist.bio && <p className="text-lg text-muted-foreground mb-6">{artist.bio}</p>}
              <div className="flex items-center gap-4">
                <Button size="lg" onClick={handlePlayAll} disabled={tracks.length === 0}>
                  <Play className="h-5 w-5 mr-2" fill="currentColor" />
                  {t('ArtistPage.playAll')}
                </Button>
                <Button variant={isLiked(artist.id) ? 'secondary' : 'outline'} size="icon" className="sm:w-auto sm:px-3 h-9 w-9" onClick={() => toggleLike(artist.id)}>
                  {isLiked(artist.id) ? <Check className="h-4 w-4 sm:mr-2" /> : <UserPlus className="h-4 w-4 sm:mr-2" />}
                  <span className="hidden sm:inline">{isLiked(artist.id) ? t('ArtistPage.following') : t('ArtistPage.follow')}</span>
                </Button>
                {isAdmin && (
                  <Button variant="outline" size="icon" className="h-9 w-9" aria-label={t('ArtistPage.delete')} onClick={() => setDeleteDialogOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <p className="text-sm text-muted-foreground">
                  {albums.length} {t('ArtistPage.albums', { count: albums.length })} · {tracks.length} {t('ArtistPage.tracks', { count: tracks.length })}
                </p>
              </div>
            </div>
          </div>

          {albums.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-4">{t('ArtistPage.albumsSectionTitle')}</h2>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 sm:gap-3">
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
