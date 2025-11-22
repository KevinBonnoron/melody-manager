import type { Artist } from '@melody-manager/shared';
import { Link } from '@tanstack/react-router';
import { User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { useAlbumsForArtist } from '@/hooks/use-album';
import { useArtistLikes } from '@/hooks/use-artist-likes';
import { useArtistTracks } from '@/hooks/use-tracks';
import { LikeButton } from '../atoms/like-button';

interface Props {
  artist: Artist;
}

export function ArtistCard({ artist }: Props) {
  const { t } = useTranslation();
  const { isLiked, toggleLike } = useArtistLikes();
  const { data: tracks = [] } = useArtistTracks(artist.id);
  const { data: albums = [] } = useAlbumsForArtist(artist.id);
  const trackCount = tracks.length;
  const albumCount = albums.length;

  return (
    <Link to="/artists/$artistId" params={{ artistId: artist.id }}>
      <Card className="group transition-all hover:shadow-lg hover:shadow-primary/10 cursor-pointer overflow-hidden relative p-0 gap-0">
        <div className="relative aspect-square overflow-hidden rounded-t-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
          {artist.imageUrl ? <img src={artist.imageUrl} alt={artist.name} className="h-full w-full object-cover" /> : <User className="h-8 w-8 sm:h-16 sm:w-16 text-primary/60" />}
        </div>
        <div className="absolute bottom-2 right-2 z-10 hidden sm:block">
          <LikeButton isLiked={isLiked(artist.id)} toggleLike={() => toggleLike(artist.id)} />
        </div>
        <CardContent className="px-2 py-1.5 sm:p-4">
          <div className="flex flex-col gap-0 sm:gap-0.5 text-center">
            <h3 className="font-semibold text-xs sm:text-sm line-clamp-1">{artist.name}</h3>
            <p className="hidden sm:block text-xs text-muted-foreground">
              {albumCount} {t('ArtistPage.albums', { count: albumCount })} · {trackCount} {t('ArtistPage.tracks', { count: trackCount })}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
