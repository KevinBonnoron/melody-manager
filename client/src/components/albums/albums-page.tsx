import type { Album, TrackProvider } from '@melody-manager/shared';
import { Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlbumGrid } from '@/components/albums/album-grid';
import { TrackProviderFilter } from '@/components/providers/track-provider-filter';
import { useAlbums } from '@/hooks/use-album';
import { PageHeader } from '../atoms/page-header';

export function AlbumsPage() {
  const { t } = useTranslation();
  const { data: albums = [], isLoading } = useAlbums();
  const [selectedProvider, setSelectedProvider] = useState<TrackProvider | 'all'>('all');

  const getAlbumProviderIds = useCallback((album: Album) => (album.expand.tracks_via_album ?? []).map((track) => track.provider), []);

  return (
    <div className="pb-32">
      <PageHeader title={t('AlbumsPage.title')} description={t('AlbumsPage.description')} />

      <div className="mb-6">
        <TrackProviderFilter selectedProvider={selectedProvider} onProviderChange={setSelectedProvider} items={albums} getItemProviderIds={getAlbumProviderIds} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <AlbumGrid albums={albums} selectedProvider={selectedProvider} />
      )}
    </div>
  );
}
