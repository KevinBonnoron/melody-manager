import { useArtistLikes } from '@/hooks/use-artist-likes';
import { Card, CardContent } from '@/components/ui/card';
import type { Artist } from '@melody-manager/shared';
import { Link } from '@tanstack/react-router';
import { User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LikeButton } from '../atoms/like-button';

interface Props {
  artist: Artist;
}

export function ArtistCard({ artist }: Props) {
  const { t } = useTranslation();
  const { isLiked, toggleLike } = useArtistLikes();
  const trackCount = artist.expand?.tracks_via_artists?.length ?? 0;
  const albumCount = artist.expand?.albums_via_artists?.length ?? 0;

  return (
    <Link to="/artists/$artistId" params={{ artistId: artist.id }}>
      <Card className="group transition-all hover:shadow-lg hover:shadow-primary/10 cursor-pointer overflow-hidden relative">
        <div className="absolute bottom-2 right-2 z-10 pointer-events-none">
          <div className="pointer-events-auto">
            <LikeButton isLiked={isLiked(artist.id)} toggleLike={() => toggleLike(artist.id)} />
          </div>
        </div>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="relative aspect-square overflow-hidden rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              {artist.imageUrl ? <img src={artist.imageUrl} alt={artist.name} className="h-full w-full object-cover" /> : <User className="h-16 w-16 text-primary/60" />}
            </div>

            <div className="flex flex-col gap-1 text-center">
              <div className="flex items-center justify-center gap-1">
                <h3 className="font-semibold text-sm line-clamp-1">{artist.name}</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {albumCount} {t('ArtistPage.albums', { count: albumCount })} · {trackCount} {t('ArtistPage.tracks', { count: trackCount })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
