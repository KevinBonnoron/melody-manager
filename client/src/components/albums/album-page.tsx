import type { Album, Artist, Track } from '@melody-manager/shared';
import { Link } from '@tanstack/react-router';
import { Check, Disc3, ExternalLink, Library, Music2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAlbumLikes } from '@/hooks/use-album-likes';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { formatDuration } from '@/lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { AlbumActionsMenu } from './album-actions-menu';
import { AlbumTable } from './album-table';
import { PlayAlbumButton } from './play-album-button';

interface Props {
  album: Album;
  tracks: Track[];
  artists: Artist[];
}

export function AlbumPage({ album, tracks, artists }: Props) {
  const { t } = useTranslation();
  const { isLiked, toggleLike } = useAlbumLikes();
  const coverUrl = getAlbumCoverUrl(album);
  const totalDuration = tracks.reduce((sum, { duration }) => sum + duration, 0);
  const sourceUrl = (() => {
    const raw = tracks.find((t) => {
      return t.sourceUrl;
    })?.sourceUrl;
    if (!raw) {
      return null;
    }

    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
      return null;
    }
  })();

  return (
    <>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 xl:gap-x-8 xl:gap-y-4 mb-8">
        <div className="row-span-2">
          <div className="w-32 h-32 xl:w-64 xl:h-64 rounded-xl overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shadow-2xl">
            {coverUrl ? <img src={coverUrl} alt={album.name} className="w-full h-full object-cover" /> : <Disc3 className="h-16 w-16 xl:h-32 xl:w-32 text-primary/60" />}
          </div>
        </div>

        <div className="flex flex-col justify-end">
          <h1 className="text-2xl xl:text-4xl font-bold leading-tight line-clamp-2">{album.name}</h1>
          <p className="text-base xl:text-xl text-muted-foreground mt-2 flex items-center gap-2 flex-wrap">
            {artists.slice(0, 1).map((artist) => (
              <Link key={artist.id} to="/artists/$artistId" params={{ artistId: artist.id }} className="hover:text-foreground hover:underline transition-colors">
                {artist.name}
              </Link>
            )) ?? t('AlbumPage.unknownArtist')}
            {artists.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Badge variant="secondary" className="text-xs cursor-pointer">
                    +{artists.length - 1}
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="flex flex-col gap-1 p-1 min-w-0">
                  {artists.slice(1).map((artist) => (
                    <Link key={artist.id} to="/artists/$artistId" params={{ artistId: artist.id }} className="text-sm hover:underline px-2 py-1 rounded hover:bg-accent">
                      {artist.name}
                    </Link>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {album.year && <>{album.year} · </>}
            {tracks.length} {t('AlbumPage.tracks', { count: tracks.length })} · {formatDuration(totalDuration, 'long')}
          </p>
        </div>

        <div className="col-span-2 xl:col-span-1 flex flex-wrap items-center gap-3 xl:gap-4">
          <PlayAlbumButton tracks={tracks} />
          <Button variant={isLiked(album.id) ? 'secondary' : 'outline'} size="icon" className="sm:w-auto sm:px-3 h-9 w-9" onClick={() => toggleLike(album.id)} aria-label={isLiked(album.id) ? t('AlbumPage.inLibrary') : t('AlbumPage.addToLibrary')}>
            {isLiked(album.id) ? <Check className="h-4 w-4 sm:mr-2" /> : <Library className="h-4 w-4 sm:mr-2" />}
            <span className="hidden sm:inline">{isLiked(album.id) ? t('AlbumPage.inLibrary') : t('AlbumPage.addToLibrary')}</span>
          </Button>
          {sourceUrl && (
            <Button variant="ghost" size="icon" className="sm:w-auto sm:px-3 h-9 w-9" asChild>
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" title={t('AlbumPage.openExternal')} aria-label={t('AlbumPage.openExternal')}>
                <ExternalLink className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('AlbumPage.openExternal')}</span>
              </a>
            </Button>
          )}
          <div className="ml-auto">
            <AlbumActionsMenu album={album} />
          </div>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Music2 className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg">{t('AlbumPage.noTracksInAlbum')}</p>
        </div>
      ) : (
        <AlbumTable tracks={tracks} />
      )}
    </>
  );
}
