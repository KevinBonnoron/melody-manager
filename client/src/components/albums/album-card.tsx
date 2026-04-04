import type { Album } from '@melody-manager/shared';
import { Link } from '@tanstack/react-router';
import { Download, Music2, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useAlbumTracks } from '@/hooks/use-tracks';
import { getAlbumDownloadStatus } from '@/lib/album-download-status';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { getProviderColor } from '@/lib/utils';

interface Props {
  album: Album;
}

export function AlbumCard({ album }: Props) {
  const { t } = useTranslation();
  const { data: tracks = [] } = useAlbumTracks(album.id);
  const trackCount = tracks.length;
  const provider = tracks[0]?.expand?.provider;
  const { currentTrack } = useMusicPlayer();
  const isCurrentAlbum = currentTrack?.album === album.id;
  const { status: downloadStatus } = getAlbumDownloadStatus(tracks);
  const coverUrl = getAlbumCoverUrl(album);
  return (
    <Link to="/albums/$albumId" params={{ albumId: album.id }}>
      <Card className={`group transition-all hover:shadow-lg hover:shadow-primary/10 cursor-pointer overflow-hidden p-0 gap-0 relative ${isCurrentAlbum ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
          {coverUrl ? <img src={coverUrl} alt={album.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <Music2 className="h-8 w-8 sm:h-12 sm:w-12 text-primary/60" />}

          {provider && (
            <div className="absolute top-2 right-2">
              <Badge variant="secondary" className={`text-xs font-medium shadow-lg backdrop-blur-sm ${getProviderColor(provider.type, 'contrast')}`}>
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
        <CardContent className="px-1.5 py-1 sm:px-2 sm:py-1.5">
          <div className="flex flex-col gap-0 sm:gap-0.5">
            <h3 className="font-semibold text-[11px] sm:text-xs line-clamp-1">{album.name}</h3>
            <p className="hidden sm:block text-[11px] text-muted-foreground line-clamp-1">{album.expand?.artists?.map((artist) => artist.name).join(', ') ?? t('AlbumPage.unknownArtist')}</p>
            <p className="hidden sm:flex text-[11px] text-muted-foreground items-center gap-1">
              <span>
                {trackCount} {t('AlbumPage.tracks', { count: trackCount })}
              </span>
              {downloadStatus !== 'none' && provider?.type === 'youtube' && <Download className="h-3 w-3 text-muted-foreground/70" />}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
