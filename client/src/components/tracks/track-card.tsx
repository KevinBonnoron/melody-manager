import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useTrackLikes } from '@/hooks/use-track-likes';
import { formatDuration, getProviderColorContrast } from '@/lib/utils';
import type { Track } from '@melody-manager/shared';
import { Link } from '@tanstack/react-router';
import { Loader2, Music2, Pause, Play, Volume2 } from 'lucide-react';
import { LikeButton } from '../atoms/like-button';

interface Props {
  track: Track;
  onPlay: (track: Track) => void;
  isPlaying?: boolean;
  isLoading?: boolean;
}

export function TrackCard({ track, onPlay, isPlaying, isLoading }: Props) {
  const { isLiked, toggleLike } = useTrackLikes();
  const { album, artists, provider, genres } = track.expand;

  return (
    <Card
      className={`group transition-all hover:shadow-lg hover:shadow-primary/10 cursor-pointer overflow-hidden p-0 relative ${isPlaying || isLoading ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
      onClick={() => onPlay(track)}
    >
      <div className="absolute bottom-2 right-2 z-10 pointer-events-none">
        <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <LikeButton isLiked={isLiked(track.id)} toggleLike={() => toggleLike(track.id)} />
        </div>
      </div>
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        {album.coverUrl ? (
          <img
            src={album.coverUrl}
            alt={track.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <Music2 className="h-16 w-16 text-primary/60" />
        )}

        <div className="absolute top-2 right-2 z-10">
          <Badge
            variant="secondary"
            className={`text-xs font-medium shadow-lg backdrop-blur-sm ${getProviderColorContrast(provider.type)}`}
          >
            {provider.type}
          </Badge>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {isPlaying && !isLoading && (
          <div className="absolute top-2 left-2 bg-primary rounded-full p-1.5 shadow-md">
            <Volume2 className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="rounded-full bg-primary p-3 shadow-lg">
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary-foreground" />
            ) : isPlaying ? (
              <Pause className="h-6 w-6 text-primary-foreground" fill="currentColor" />
            ) : (
              <Play className="h-6 w-6 text-primary-foreground ml-0.5" fill="currentColor" />
            )}
          </div>
        </div>
      </div>
      <CardContent className="p-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold text-sm line-clamp-1">{track.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-1">
            {artists.map((artist, index) => (
              <span key={artist.id}>
                {index > 0 && ', '}
                <Link
                  to="/artists/$artistId"
                  params={{ artistId: artist.id }}
                  className="hover:text-foreground hover:underline transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {artist.name}
                </Link>
              </span>
            ))}
          </p>
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
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
