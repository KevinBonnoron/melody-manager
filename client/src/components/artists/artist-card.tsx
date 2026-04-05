import type { Artist } from '@melody-manager/shared';
import { Link } from '@tanstack/react-router';
import { User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAlbumsForArtist } from '@/hooks/use-album';
import { useArtistTracks } from '@/hooks/use-tracks';
import { getArtistImageUrl } from '@/lib/cover-url';

interface Props {
  artist: Artist;
}

export function ArtistCard({ artist }: Props) {
  const { t } = useTranslation();
  const { data: tracks = [] } = useArtistTracks(artist.id);
  const { data: albums = [] } = useAlbumsForArtist(artist.id);
  const trackCount = tracks.length;
  const albumCount = albums.length;
  const imageUrl = getArtistImageUrl(artist);
  return (
    <Link to="/artists/$artistId" params={{ artistId: artist.id }} className="group flex flex-col items-center gap-1.5 sm:gap-2 cursor-pointer">
      <div className="relative aspect-square w-full overflow-hidden rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
        {imageUrl ? <img src={imageUrl} alt={artist.name} className="h-full w-full object-cover" /> : <User className="h-1/3 w-1/3 text-primary/60" />}
      </div>
      <div className="flex flex-col items-center gap-0 text-center w-full px-1">
        <h3 className="font-semibold text-xs sm:text-sm line-clamp-1">{artist.name}</h3>
        <p className="hidden sm:block text-[11px] text-muted-foreground">
          {albumCount} {t('ArtistPage.albums', { count: albumCount })} · {trackCount} {t('ArtistPage.tracks', { count: trackCount })}
        </p>
      </div>
    </Link>
  );
}
