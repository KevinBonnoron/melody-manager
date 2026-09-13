import { Link } from '@tanstack/react-router';
import { Loader2, Music2, Pause, Play, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { resolveAll, useAlbumsById, useArtistsById, useGenresById } from '@/hooks/use-library-index';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { formatDuration, getProviderColor } from '@/lib/utils';
import type { Track } from '@/shared';

interface Props {
  track: Track;
  onPlay: (track: Track) => void;
  isPlaying?: boolean;
  isLoading?: boolean;
}

// The ring is drawn inside the card rather than around it: the grid skips the
// rendering of what is off screen, and that containment clips anything painted
// outside a card's own box, which left the marker showing only at the sides.
export function TrackCard({ track, onPlay, isPlaying, isLoading }: Props) {
  const { t } = useTranslation();
  const album = useAlbumsById().get(track.album);
  const artists = resolveAll(track.artists, useArtistsById());
  const genres = resolveAll(track.genres, useGenresById());
  const unavailable = track.availability === 'none';
  return (
    <Card
      className={`group transition-all overflow-hidden p-0 gap-0 relative ${unavailable ? 'cursor-not-allowed opacity-45 saturate-0' : 'cursor-pointer hover:shadow-lg hover:shadow-primary/10'} ${isPlaying || isLoading ? 'playing-ring' : ''}`}
      title={unavailable ? t('Track.unavailable') : undefined}
      onClick={() => {
        if (!unavailable) {
          onPlay(track);
        }
      }}
    >
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        {album && getAlbumCoverUrl(album) ? <img src={getAlbumCoverUrl(album)} alt={track.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <Music2 className="h-8 w-8 sm:h-12 sm:w-12 text-primary/60" />}

        <div className="absolute top-2 right-2 z-10">
          <Badge variant="secondary" className={`text-xs font-medium shadow-lg backdrop-blur-sm ${getProviderColor(track.source, 'contrast')}`}>
            {track.source}
          </Badge>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {isPlaying && !isLoading && (
          <div className="absolute top-2 left-2 bg-primary rounded-full p-1.5 shadow-md">
            <Volume2 className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
        )}

        {/* Bottom right like the album card, so the two read the same. Clicking
            anywhere on this card still plays it: the mark says what is about to
            happen, it is not the only place that does it. */}
        <div className="absolute bottom-2 right-2 opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isPlaying ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4 ml-0.5" fill="currentColor" />}</div>
        </div>
      </div>
      {/* `line-clamp` needs display:-webkit-box, which a `sm:block` on the same
          element overrides: the line then wrapped, the card grew taller than its
          neighbours, and the virtualised rows landed on top of each other.
          `truncate` does not care what the display is. */}
      <CardContent className="px-1.5 py-1 sm:px-2 sm:py-1.5">
        <div className="flex flex-col gap-0 sm:gap-0.5">
          <h3 className="font-semibold text-[11px] sm:text-xs line-clamp-1">{track.title}</h3>
          <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
            {artists.map((artist, index) => (
              <span key={artist.id}>
                {index > 0 && ', '}
                <Link to="/artists/$artistId" params={{ artistId: artist.id }} className="hover:text-foreground hover:underline transition-colors" onClick={(e) => e.stopPropagation()}>
                  {artist.name}
                </Link>
              </span>
            ))}
            {album && (
              <>
                <span className="mx-1 opacity-60">·</span>
                <Link to="/albums/$albumId" params={{ albumId: album.id }} className="transition-colors hover:text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>
                  {album.name}
                </Link>
              </>
            )}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground hidden sm:flex">
            <span>{formatDuration(track.duration)}</span>
            {genres?.slice(0, 1).map((genre) => (
              <Badge key={genre.id} variant="secondary" className="text-xs">
                {genre.name}
              </Badge>
            ))}
            {genres && genres.length > 1 && (
              <Badge variant="secondary" className="text-xs">
                +{genres.length - 1}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
