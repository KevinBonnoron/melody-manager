import { useAlbumLikes } from '@/hooks/use-album-likes';
import { formatDuration } from '@/lib/utils';
import type { Album, Artist, Track } from '@melody-manager/shared';
import { Link } from '@tanstack/react-router';
import { Disc3, Music2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LikeButton } from '../atoms/like-button';
import { Badge } from '../ui/badge';
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
  const totalDuration = tracks.reduce((sum, { duration }) => sum + duration, 0);

  return (
    <>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 xl:gap-x-8 xl:gap-y-4 mb-8">
        <div className="row-span-2">
          <div className="w-32 h-32 xl:w-64 xl:h-64 rounded-xl overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shadow-2xl">
            {album.coverUrl ? <img src={album.coverUrl} alt={album.name} className="w-full h-full object-cover" /> : <Disc3 className="h-16 w-16 xl:h-32 xl:w-32 text-primary/60" />}
          </div>
        </div>

        <div className="flex flex-col justify-end">
          <p className="text-sm text-muted-foreground mb-2">{t('AlbumPage.albumLabel')}</p>
          <h1 className="text-2xl xl:text-4xl font-bold leading-tight">{album.name}</h1>
          <p className="text-base xl:text-xl text-muted-foreground mt-2 xl:mt-4 flex items-center gap-2 flex-wrap">
            {artists.slice(0, 1).map((artist) => (
              <Link key={artist.id} to="/artists/$artistId" params={{ artistId: artist.id }} className="hover:text-foreground hover:underline transition-colors">
                {artist.name}
              </Link>
            )) ?? t('AlbumPage.unknownArtist')}
            {artists.length > 1 && (
              <Badge variant="secondary" className="text-xs">
                +{artists.length - 1}
              </Badge>
            )}
          </p>
        </div>

        <div className="col-span-2 xl:col-span-1 flex flex-wrap items-center gap-3 xl:gap-4">
          <PlayAlbumButton tracks={tracks} />
          <div className="shrink-0">
            <LikeButton isLiked={isLiked(album.id)} toggleLike={() => toggleLike(album.id)} />
          </div>
          <p className="text-sm text-muted-foreground">
            {tracks.length} {t('AlbumPage.tracks', { count: tracks.length })} · {formatDuration(totalDuration, 'long')}
          </p>
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
