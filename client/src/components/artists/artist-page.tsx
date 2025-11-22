import { useAlbumsForArtist } from '@/hooks/use-album';
import { useArtist } from '@/hooks/use-artists';
import { useArtistTracks } from '@/hooks/use-tracks';
import { useArtistLikes } from '@/hooks/use-artist-likes';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { Loader2, Play, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LikeButton } from '../atoms/like-button';
import { AlbumCard } from '../albums/album-card';
import { Button } from '../ui/button';

interface Props {
  artistId: string;
}

export function ArtistPage({ artistId }: Props) {
  const { t } = useTranslation();
  const { data: artist, isLoading } = useArtist(artistId);
  const { data: tracks = [] } = useArtistTracks(artistId);
  const { data: albums = [] } = useAlbumsForArtist(artistId);
  const { isLiked, toggleLike } = useArtistLikes();
  const { playTrack, setQueue } = useMusicPlayer();

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      setQueue(tracks);
      playTrack(tracks[0]);
    }
  };

  return (
    <div className="pb-32">
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : artist ? (
        <>
          <div className="flex flex-col md:flex-row gap-8 mb-8">
            <div className="flex-shrink-0">
              <div className="w-64 h-64 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shadow-2xl">
                {artist.imageUrl ? <img src={artist.imageUrl} alt={artist.name} className="w-full h-full object-cover" /> : <User className="h-32 w-32 text-primary/60" />}
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-end">
              <p className="text-sm text-muted-foreground mb-2">{t('ArtistPage.artistLabel')}</p>
              <h1 className="text-5xl font-bold mb-4">{artist.name}</h1>
              {artist.bio && <p className="text-lg text-muted-foreground mb-6">{artist.bio}</p>}
              <div className="flex items-center gap-4">
                <Button size="lg" onClick={handlePlayAll} disabled={tracks.length === 0}>
                  <Play className="h-5 w-5 mr-2" fill="currentColor" />
                  {t('ArtistPage.playAll')}
                </Button>
                <div className="shrink-0">
                  <LikeButton isLiked={isLiked(artist.id)} toggleLike={() => toggleLike(artist.id)} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {albums.length} {t('ArtistPage.albums', { count: albums.length })} · {tracks.length} {t('ArtistPage.tracks', { count: tracks.length })}
                </p>
              </div>
            </div>
          </div>

          {albums.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-4">{t('ArtistPage.albumsSectionTitle')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
    </div>
  );
}
