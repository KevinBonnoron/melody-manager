import type { Album, Artist, Track } from '@melody-manager/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlbumCard } from '@/components/albums/album-card';
import { ArtistCard } from '@/components/artists/artist-card';
import { TrackGrid } from '@/components/tracks/track-grid';
import { CardSkeletonGrid } from '@/components/atoms/card-skeleton';
import { useAlbums } from '@/hooks/use-album';
import { useArtists } from '@/hooks/use-artists';
import { useTracks } from '@/hooks/use-tracks';

const RECENT_LIMIT = 6;
const RECENT_TRACKS_LIMIT = 12;

function sortByCreatedDesc<T extends { created: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
}

export function HomePage() {
  const { t } = useTranslation();
  const { data: allArtists = [], isLoading: isLoadingArtists } = useArtists();
  const { data: allAlbums = [], isLoading: isLoadingAlbums } = useAlbums();
  const { data: allTracks = [], isLoading: isLoadingTracks } = useTracks();

  const recentArtists = useMemo(() => sortByCreatedDesc(allArtists).slice(0, RECENT_LIMIT), [allArtists]);
  const recentAlbums = useMemo(() => sortByCreatedDesc(allAlbums).slice(0, RECENT_LIMIT), [allAlbums]);
  const recentTracks = useMemo(() => sortByCreatedDesc(allTracks).slice(0, RECENT_TRACKS_LIMIT), [allTracks]);

  return (
    <div className="space-y-10 pb-48">
      <RecentSection<Artist>
        title={t('HomePage.recentArtists')}
        items={recentArtists}
        isLoading={isLoadingArtists}
        renderGrid={(items) => (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
            {items.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        )}
      />

      <RecentSection<Album>
        title={t('HomePage.recentAlbums')}
        items={recentAlbums}
        isLoading={isLoadingAlbums}
        renderGrid={(items) => (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
            {items.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}
      />

      <RecentSection<Track> title={t('HomePage.recentTracks')} items={recentTracks} isLoading={isLoadingTracks} renderGrid={(items) => <TrackGrid tracks={items} provider="all" />} />
    </div>
  );
}

interface RecentSectionProps<T> {
  title: string;
  items: T[];
  isLoading: boolean;
  renderGrid: (items: T[]) => React.ReactNode;
}

function RecentSection<T>({ title, items, isLoading, renderGrid }: RecentSectionProps<T>) {
  if (!isLoading && items.length === 0) {
    return null;
  }

  return (
    <section>
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      {isLoading ? <CardSkeletonGrid /> : renderGrid(items)}
    </section>
  );
}
