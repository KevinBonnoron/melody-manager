import type { Album, TrackProvider } from '@melody-manager/shared';
import { useCallback, useMemo, useState } from 'react';
import { AlbumGrid } from '@/components/albums/album-grid';
import { CardSkeletonGrid } from '@/components/atoms/card-skeleton';
import { TrackProviderFilter } from '@/components/providers/track-provider-filter';
import { useAlbums } from '@/hooks/use-album';
import { useTracks } from '@/hooks/use-tracks';

export function AlbumsPage() {
  const { data: albums = [], isLoading } = useAlbums();
  const { data: allTracks = [] } = useTracks();
  const [selectedProvider, setSelectedProvider] = useState<TrackProvider | 'all'>('all');

  const providerIdsByAlbum = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const track of allTracks) {
      const list = map.get(track.album) ?? [];
      if (!list.includes(track.provider)) {
        list.push(track.provider);
      }
      map.set(track.album, list);
    }
    return map;
  }, [allTracks]);

  const getAlbumProviderIds = useCallback((album: Album) => providerIdsByAlbum.get(album.id) ?? [], [providerIdsByAlbum]);

  const filteredAlbums = selectedProvider === 'all' ? albums : albums.filter((album) => providerIdsByAlbum.get(album.id)?.includes(selectedProvider.id));

  return (
    <div className="pb-48">
      <div className="mb-6">
        <TrackProviderFilter selectedProvider={selectedProvider} onProviderChange={setSelectedProvider} items={albums} getItemProviderIds={getAlbumProviderIds} />
      </div>

      {isLoading ? <CardSkeletonGrid /> : <AlbumGrid albums={filteredAlbums} />}
    </div>
  );
}
