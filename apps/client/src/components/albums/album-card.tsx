import { Link } from '@tanstack/react-router';
import { Download, Music2, Play, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { resolveAll, useArtistsById } from '@/hooks/use-library-index';
import { useNowPlaying } from '@/hooks/use-now-playing';
import { useAlbumTracks } from '@/hooks/use-tracks';
import { getAlbumDownloadStatus } from '@/lib/album-download-status';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { getProviderColor } from '@/lib/utils';
import type { Album } from '@/shared';

interface Props {
  album: Album;
}

export function AlbumCard({ album }: Props) {
  const { t } = useTranslation();
  const artists = resolveAll(album.artists, useArtistsById());
  const { data: tracks = [] } = useAlbumTracks(album.id);
  const trackCount = tracks.length;
  const providerType = tracks[0]?.source;
  const { track: nowPlaying } = useNowPlaying();
  const { play } = useMusicPlayer();
  const isCurrentAlbum = nowPlaying?.album === album.id;
  const { status: downloadStatus } = getAlbumDownloadStatus(tracks);
  const unavailable = trackCount > 0 && tracks.every((track) => track.availability === 'none');
  const playable = tracks.filter((track) => track.availability !== 'none');
  const coverUrl = getAlbumCoverUrl(album);
  return (
    <Card className={`group transition-all overflow-hidden p-0 gap-0 relative ${unavailable ? 'opacity-45 saturate-0' : 'cursor-pointer hover:shadow-lg hover:shadow-primary/10'} ${isCurrentAlbum ? 'playing-ring' : ''}`} title={unavailable ? t('Album.unavailable') : undefined}>
      <Link to="/albums/$albumId" params={{ albumId: album.id }} className="relative flex aspect-square items-center justify-center overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20">
        {coverUrl ? <img src={coverUrl} alt={album.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <Music2 className="h-1/3 w-1/3 text-primary/60" />}

        {providerType && (
          <div className="absolute top-2 right-2">
            <Badge variant="secondary" className={`text-xs font-medium shadow-lg backdrop-blur-sm ${getProviderColor(providerType, 'contrast')}`}>
              {providerType}
            </Badge>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {playable.length > 0 && (
          <button
            type="button"
            aria-label={t('AlbumPage.playAlbum')}
            title={t('AlbumPage.playAlbum')}
            className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-200 hover:scale-105 md:pointer-events-none md:translate-y-1 md:opacity-0 md:focus-visible:pointer-events-auto md:focus-visible:translate-y-0 md:focus-visible:opacity-100 md:group-hover:pointer-events-auto md:group-hover:translate-y-0 md:group-hover:opacity-100"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              play(playable);
            }}
          >
            <Play className="h-4 w-4" fill="currentColor" />
          </button>
        )}

        {isCurrentAlbum && (
          <div className="absolute top-2 left-2 bg-primary rounded-full p-1.5 shadow-md">
            <Volume2 className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
        )}
      </Link>
      <CardContent className="px-1.5 py-1 sm:px-2 sm:py-1.5">
        <div className="flex flex-col gap-0 sm:gap-0.5">
          <Link to="/albums/$albumId" params={{ albumId: album.id }} className="font-semibold text-[11px] sm:text-xs line-clamp-1 hover:underline">
            {album.name}
          </Link>
          <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
            {artists.length
              ? artists.map((artist, index) => (
                  <span key={artist.id}>
                    {index > 0 && ', '}
                    <Link to="/artists/$artistId" params={{ artistId: artist.id }} className="transition-colors hover:text-foreground hover:underline">
                      {artist.name}
                    </Link>
                  </span>
                ))
              : t('AlbumPage.unknownArtist')}
          </p>
          <p className="hidden sm:flex text-[11px] text-muted-foreground items-center gap-1">
            <span>
              {trackCount} {t('AlbumPage.tracks', { count: trackCount })}
            </span>
            {downloadStatus !== 'none' && providerType === 'youtube' && <Download className="h-3 w-3 text-muted-foreground/70" />}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
