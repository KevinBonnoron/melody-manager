import type { Album, TrackProvider } from '@melody-manager/shared';
import { Disc3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AlbumCard } from './album-card';

interface Props {
  albums: Album[];
  selectedProvider?: TrackProvider | 'all';
}

export function AlbumGrid({ albums, selectedProvider = 'all' }: Props) {
  const { t } = useTranslation();
  const filteredAlbums =
    selectedProvider === 'all'
      ? albums
      : albums.filter((album) => {
          const tracks = album.expand?.tracks_via_album || [];
          return tracks.some((track) => track.provider === selectedProvider.id);
        });

  return (
    <>
      {filteredAlbums.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Disc3 className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg">{t('AlbumGrid.noAlbumsFound')}</p>
          <p className="text-sm">{selectedProvider === 'all' ? t('AlbumGrid.addMusicToSeeAlbums') : t('AlbumGrid.noAlbumsFromProvider', { provider: selectedProvider.type })}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredAlbums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </>
  );
}
