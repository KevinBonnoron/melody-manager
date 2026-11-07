import { Link } from '@tanstack/react-router';
import { Disc3, Music2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAlbumRatings } from '@/hooks/use-ratings';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { formatDuration } from '@/lib/utils';
import type { Album, Artist, Track } from '@/shared';
import { LibraryButton } from '../atoms/library-button';
import { PageHeader } from '../layout/page-header-block';
import { PlayButton } from '../tracks/play-button';
import { TrackTable } from '../tracks/track-table';
import { Badge } from '../ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { AlbumActionsMenu } from './album-actions-menu';

interface Props {
  album: Album;
  tracks: Track[];
  artists: Artist[];
}

export function AlbumPage({ album, tracks, artists }: Props) {
  const { t } = useTranslation();
  const { ratingOf, toggleLike, toggleDislike, isReady: ratingsReady } = useAlbumRatings();
  const coverUrl = getAlbumCoverUrl(album);
  const totalDuration = tracks.reduce((sum, { duration }) => sum + duration, 0);
  const origin = (() => {
    const raw = tracks.find((t) => {
      return t.origin;
    })?.origin;
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
      <PageHeader
        media={<div className="h-full w-full rounded-xl overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shadow-2xl">{coverUrl ? <img src={coverUrl} alt={album.name} className="w-full h-full object-cover" /> : <Disc3 className="h-1/2 w-1/2 text-primary/60" />}</div>}
        title={album.name}
        subtitle={
          <>
            {artists.length > 0 ? (
              <Link to="/artists/$artistId" params={{ artistId: artists[0].id }} className="truncate hover:text-foreground hover:underline transition-colors">
                {artists[0].name}
              </Link>
            ) : (
              t('AlbumPage.unknownArtist')
            )}
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
            <span>·</span>
            {album.year && (
              <>
                <span>{album.year}</span>
                <span>·</span>
              </>
            )}
            <span>
              {tracks.length} {t('AlbumPage.tracks', { count: tracks.length })}
            </span>
            <span>·</span>
            <span>{formatDuration(totalDuration, 'long')}</span>
          </>
        }
        actions={
          <>
            <PlayButton tracks={tracks} label={t('AlbumPage.playAlbum')} />
            <LibraryButton value={ratingOf(album.id)?.value} ready={ratingsReady} onLike={() => toggleLike(album.id)} onUndislike={() => toggleDislike(album.id)} />
          </>
        }
        menu={<AlbumActionsMenu album={album} currentArtistId={artists[0]?.id} origin={origin ?? undefined} />}
      />

      {tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Music2 className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg">{t('AlbumPage.noTracksInAlbum')}</p>
        </div>
      ) : (
        <TrackTable tracks={tracks} />
      )}
    </>
  );
}
