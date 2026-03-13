import type { Track, TrackProvider } from '@melody-manager/shared';
import { useCallback, useState } from 'react';
import { CardSkeletonGrid } from '@/components/atoms/card-skeleton';
import { TrackProviderFilter } from '@/components/providers/track-provider-filter';
import { TrackGrid } from '@/components/tracks/track-grid';
import { useTracks } from '@/hooks/use-tracks';

export function TrackPage() {
  const [selectedProvider, setSelectedProvider] = useState<TrackProvider | 'all'>('all');
  const { data: tracks = [], isLoading: isLoadingTracks } = useTracks();

  const getTrackProviderIds = useCallback((track: Track) => [track.provider], []);

  const isLoading = isLoadingTracks;

  return (
    <div>
      <div className="mb-6">
        <TrackProviderFilter selectedProvider={selectedProvider} onProviderChange={setSelectedProvider} items={tracks} getItemProviderIds={getTrackProviderIds} />
      </div>

      {isLoading ? <CardSkeletonGrid /> : <TrackGrid tracks={tracks} provider={selectedProvider} />}
    </div>
  );
}
