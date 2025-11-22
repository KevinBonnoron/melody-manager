import type { Artist, TrackProvider } from '@melody-manager/shared';
import { User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ArtistCard } from './artist-card';

interface Props {
  artists: Artist[];
  selectedProvider?: TrackProvider | 'all';
}

export function ArtistGrid({ artists, selectedProvider = 'all' }: Props) {
  const { t } = useTranslation();
  const filteredArtists =
    selectedProvider === 'all'
      ? artists
      : artists.filter((artist) => {
          const tracks = artist.expand?.tracks_via_artists || [];
          return tracks.some((track) => track.provider === selectedProvider.id);
        });

  return (
    <>
      {filteredArtists.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <User className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg">{t('ArtistGrid.noArtistsFound')}</p>
          <p className="text-sm">{selectedProvider === 'all' ? t('ArtistGrid.addMusicToSeeArtists') : t('ArtistGrid.noArtistsFromProvider', { provider: selectedProvider.type })}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {filteredArtists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </div>
      )}
    </>
  );
}
