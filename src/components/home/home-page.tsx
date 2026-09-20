import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlbumCard } from '@/components/albums/album-card';
import { ArtistCard } from '@/components/artists/artist-card';
import { CardSkeletonGrid } from '@/components/atoms/card-skeleton';
import { PlaylistCard } from '@/components/playlists/playlist-card';
import { Button } from '@/components/ui/button';
import { useAlbums } from '@/hooks/use-album';
import { useArtists } from '@/hooks/use-artists';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useSmartPlaylists } from '@/hooks/use-playlists';
import type { Album, Artist, Playlist } from '@/shared';

const RECENT_LIMIT = 6;
const CAROUSEL = '-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 [&>*]:snap-start md:mx-0 md:grid md:overflow-visible md:px-0 md:[&>*]:w-auto';
function sortByCreatedDesc<T extends { created: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
}

export function HomePage() {
  const { t } = useTranslation();
  const { data: allArtists = [], isLoading: isLoadingArtists } = useArtists();
  const { data: allAlbums = [], isLoading: isLoadingAlbums } = useAlbums();
  const { data: smartPlaylists = [], isLoading: isLoadingPlaylists } = useSmartPlaylists();
  const sortedArtists = useMemo(() => sortByCreatedDesc(allArtists), [allArtists]);
  const sortedAlbums = useMemo(() => sortByCreatedDesc(allAlbums), [allAlbums]);
  const sortedSmartPlaylists = useMemo(() => sortByCreatedDesc(smartPlaylists), [smartPlaylists]);

  return (
    <div className="space-y-10">
      <RecentSection<Playlist> title={t('HomePage.smartPlaylists')} items={sortedSmartPlaylists} isLoading={isLoadingPlaylists} gridClassName="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3" renderItem={(playlist) => <PlaylistCard key={playlist.id} playlist={playlist} />} />

      <RecentSection<Artist>
        title={t('HomePage.recentArtists')}
        items={sortedArtists}
        isLoading={isLoadingArtists}
        gridClassName={`${CAROUSEL} [&>*]:w-[100px] md:grid-cols-[repeat(auto-fill,minmax(110px,1fr))] md:gap-4`}
        skeletonVariant="circular"
        renderItem={(artist) => <ArtistCard key={artist.id} artist={artist} />}
      />

      <RecentSection<Album> title={t('HomePage.recentAlbums')} items={sortedAlbums} isLoading={isLoadingAlbums} gridClassName={`${CAROUSEL} [&>*]:w-[150px] md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]`} renderItem={(album) => <AlbumCard key={album.id} album={album} />} />
    </div>
  );
}

const MOBILE_LIMIT = 20;

interface RecentSectionProps<T> {
  title: string;
  items: T[];
  isLoading: boolean;
  renderItem: (item: T) => React.ReactNode;
  gridClassName?: string;
  skeletonVariant?: 'default' | 'circular';
}

function RecentSection<T>({ title, items, isLoading, renderItem, gridClassName, skeletonVariant }: RecentSectionProps<T>) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  if (!isLoading && items.length === 0) {
    return null;
  }

  const hasMore = !isMobile && items.length > RECENT_LIMIT;
  const displayItems = isMobile ? items.slice(0, MOBILE_LIMIT) : expanded ? items : items.slice(0, RECENT_LIMIT);
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        {hasMore && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded((prev) => !prev)} className="text-muted-foreground hover:text-foreground">
            {expanded ? t('LibraryPage.showLess') : t('LibraryPage.seeMore')}
            <ChevronRight className={`ml-1 h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </Button>
        )}
      </div>
      {isLoading ? <CardSkeletonGrid count={RECENT_LIMIT} gridClassName={gridClassName} variant={skeletonVariant} /> : <div className={gridClassName ?? 'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 sm:gap-3'}>{displayItems.map(renderItem)}</div>}
    </section>
  );
}
