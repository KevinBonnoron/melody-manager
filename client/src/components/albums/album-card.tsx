import { useAlbumLikes } from '@/hooks/use-album-likes';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { getProviderColorContrast } from '@/lib/utils';
import type { Album } from '@melody-manager/shared';
import { Link } from '@tanstack/react-router';
import { Music2, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LikeButton } from '../atoms/like-button';

interface Props {
  album: Album;
}

export function AlbumCard({ album }: Props) {
  const { t } = useTranslation();
  const { isLiked, toggleLike } = useAlbumLikes();
  const tracks = album.expand?.tracks_via_album ?? [];
  const trackCount = tracks.length;
  const provider = tracks[0]?.expand?.provider;
  const { currentTrack } = useMusicPlayer();
  const isCurrentAlbum = currentTrack?.album === album.id;

  return (
    <Link to="/albums/$albumId" params={{ albumId: album.id }}>
      <Card className={`group transition-all hover:shadow-lg hover:shadow-primary/10 cursor-pointer overflow-hidden p-0 relative ${isCurrentAlbum ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
        <div className="absolute bottom-2 right-2 z-10 pointer-events-none">
          <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            <LikeButton isLiked={isLiked(album.id)} toggleLike={() => toggleLike(album.id)} />
          </div>
        </div>
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
          {album.coverUrl ? <img src={album.coverUrl} alt={album.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <Music2 className="h-16 w-16 text-primary/60" />}

          {provider && (
            <div className="absolute top-2 right-2 z-10">
              <Badge
                variant="secondary"
                className={`text-xs font-medium shadow-lg backdrop-blur-sm ${getProviderColorContrast(provider.type)}`}
              >
                {provider.type}
              </Badge>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {isCurrentAlbum && (
            <div className="absolute top-2 left-2 bg-primary rounded-full p-1.5 shadow-md">
              <Volume2 className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
          )}
        </div>
        <CardContent className="p-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold text-sm line-clamp-1">{album.name}</h3>
            <p className="text-sm text-muted-foreground line-clamp-1">{album.expand?.artists?.map((artist) => artist.name).join(', ') ?? t('AlbumPage.unknownArtist')}</p>
            <p className="text-xs text-muted-foreground">
              {trackCount} {t('AlbumPage.tracks', { count: trackCount })}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
