import type { Track, TrackProvider } from '@melody-manager/shared';
import { Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrackProviderFilter } from '@/components/providers/track-provider-filter';
import { TrackGrid } from '@/components/tracks/track-grid';
import { useTracks } from '@/hooks/use-tracks';
import { PageHeader } from '../atoms/page-header';

export function TrackPage() {
  const { t } = useTranslation();
  const [selectedProvider, setSelectedProvider] = useState<TrackProvider | 'all'>('all');
  const { data: tracks = [], isLoading: isLoadingTracks } = useTracks();

  const getTrackProviderIds = useCallback((track: Track) => [track.provider], []);

  const isLoading = isLoadingTracks;

  return (
    <div className="pb-32">
      <PageHeader title={t('TrackPage.title')} description={t('TrackPage.description')} />

      <div className="mb-6">
        <TrackProviderFilter selectedProvider={selectedProvider} onProviderChange={setSelectedProvider} items={tracks} getItemProviderIds={getTrackProviderIds} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <TrackGrid tracks={tracks} provider={selectedProvider} />
      )}
    </div>
  );
}
