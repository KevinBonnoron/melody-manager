import type { Artist, TrackProvider } from '@melody-manager/shared';
import { useCallback, useMemo, useState } from 'react';
import { ArtistGrid } from '@/components/artists/artist-grid';
import { CardSkeletonGrid } from '@/components/atoms/card-skeleton';
import { TrackProviderFilter } from '@/components/providers/track-provider-filter';
import { useArtists } from '@/hooks/use-artists';
import { useTracks } from '@/hooks/use-tracks';

export function ArtistListPage() {
  const { data: artists = [], isLoading } = useArtists();
  const { data: allTracks = [] } = useTracks();
  const [selectedProvider, setSelectedProvider] = useState<TrackProvider | 'all'>('all');

  const providerIdsByArtist = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const track of allTracks) {
      for (const artistId of track.artists) {
        const list = map.get(artistId) ?? [];
        if (!list.includes(track.provider)) {
          list.push(track.provider);
        }
        map.set(artistId, list);
      }
    }
    return map;
  }, [allTracks]);

  const getArtistProviderIds = useCallback((artist: Artist) => providerIdsByArtist.get(artist.id) ?? [], [providerIdsByArtist]);

  const filteredArtists = selectedProvider === 'all' ? artists : artists.filter((artist) => providerIdsByArtist.get(artist.id)?.includes(selectedProvider.id));

  return (
    <div className="pb-32">
      <div className="mb-6">
        <TrackProviderFilter selectedProvider={selectedProvider} onProviderChange={setSelectedProvider} items={artists} getItemProviderIds={getArtistProviderIds} />
      </div>

      {isLoading ? <CardSkeletonGrid variant="circular" /> : <ArtistGrid artists={filteredArtists} />}
    </div>
  );
}
