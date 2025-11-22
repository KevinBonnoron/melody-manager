import type { Album } from '@melody-manager/shared';
import { Disc3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AlbumCard } from './album-card';

interface Props {
  albums: Album[];
}

export function AlbumGrid({ albums }: Props) {
  const { t } = useTranslation();

  return (
    <>
      {albums.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Disc3 className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg">{t('AlbumGrid.noAlbumsFound')}</p>
          <p className="text-sm">{t('AlbumGrid.addMusicToSeeAlbums')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </>
  );
}
