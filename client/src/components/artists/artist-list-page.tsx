import { ArtistGrid } from '@/components/artists/artist-grid';
import { TrackProviderFilter } from '@/components/providers/track-provider-filter';
import { useArtists } from '@/hooks/use-artists';
import type { Artist, TrackProvider } from '@melody-manager/shared';
import { Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../atoms/page-header';

export function ArtistListPage() {
  const { t } = useTranslation();
  const { data: artists = [], isLoading } = useArtists();
  const [selectedProvider, setSelectedProvider] = useState<TrackProvider | 'all'>('all');

  const getArtistProviderIds = useCallback((artist: Artist) => (artist.expand?.tracks_via_artists || []).map((track) => track.provider), []);

  return (
    <div className="pb-32">
      <PageHeader title={t('ArtistsPage.title')} description={t('ArtistsPage.description')} />

      <div className="mb-6">
        <TrackProviderFilter selectedProvider={selectedProvider} onProviderChange={setSelectedProvider} items={artists} getItemProviderIds={getArtistProviderIds} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <ArtistGrid artists={artists} selectedProvider={selectedProvider} />
      )}
    </div>
  );
}
