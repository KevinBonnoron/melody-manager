import type { Album, Artist } from '@melody-manager/shared';
import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlbumCard } from '@/components/albums/album-card';
import { ArtistCard } from '@/components/artists/artist-card';
import { CardSkeletonGrid } from '@/components/atoms/card-skeleton';
import { Button } from '@/components/ui/button';
import { useAlbums } from '@/hooks/use-album';
import { useArtists } from '@/hooks/use-artists';

const RECENT_LIMIT = 6;

function sortByCreatedDesc<T extends { created: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
}

export function HomePage() {
  const { t } = useTranslation();
  const { data: allArtists = [], isLoading: isLoadingArtists } = useArtists();
  const { data: allAlbums = [], isLoading: isLoadingAlbums } = useAlbums();

  const sortedArtists = useMemo(() => sortByCreatedDesc(allArtists), [allArtists]);
  const sortedAlbums = useMemo(() => sortByCreatedDesc(allAlbums), [allAlbums]);

  return (
    <div className="space-y-10 pb-48">
      <RecentSection<Artist> title={t('HomePage.recentArtists')} items={sortedArtists} isLoading={isLoadingArtists} gridClassName="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-3 sm:gap-4" renderItem={(artist) => <ArtistCard key={artist.id} artist={artist} />} />

      <RecentSection<Album> title={t('HomePage.recentAlbums')} items={sortedAlbums} isLoading={isLoadingAlbums} renderItem={(album) => <AlbumCard key={album.id} album={album} />} />
    </div>
  );
}

interface RecentSectionProps<T> {
  title: string;
  items: T[];
  isLoading: boolean;
  renderItem: (item: T) => React.ReactNode;
  gridClassName?: string;
}

function RecentSection<T>({ title, items, isLoading, renderItem, gridClassName }: RecentSectionProps<T>) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!isLoading && items.length === 0) {
    return null;
  }

  const hasMore = items.length > RECENT_LIMIT;
  const displayItems = expanded ? items : items.slice(0, RECENT_LIMIT);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        {hasMore && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded((prev) => !prev)} className="text-muted-foreground hover:text-foreground">
            {expanded ? t('LibraryPage.showLess') : t('LibraryPage.seeAll')}
            <ChevronRight className={`ml-1 h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </Button>
        )}
      </div>
      {isLoading ? <CardSkeletonGrid gridClassName={gridClassName} /> : <div className={gridClassName ?? 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 sm:gap-3'}>{displayItems.map(renderItem)}</div>}
    </section>
  );
}
