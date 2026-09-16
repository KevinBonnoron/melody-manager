import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronRight, Library, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlbumCard } from '@/components/albums/album-card';
import { ArtistCard } from '@/components/artists/artist-card';
import { CardGrid } from '@/components/atoms/card-grid';
import { EmptyTab } from '@/components/atoms/empty-tab';
import { SectionTabs } from '@/components/atoms/section-tabs';
import { SourceFilterBar } from '@/components/atoms/source-filter-bar';
import { CreatePlaylistDialog } from '@/components/playlists/create-playlist-dialog';
import { NewPlaylistCard } from '@/components/playlists/new-playlist-card';
import { PlaylistCard } from '@/components/playlists/playlist-card';
import { TrackGrid } from '@/components/tracks/track-grid';
import { Button } from '@/components/ui/button';
import { useAlbumsByIds } from '@/hooks/use-album';
import { useArtistsByIds } from '@/hooks/use-artists';
import { useManualPlaylists } from '@/hooks/use-playlists';
import { useLikedAlbumIds, useLikedArtistIds, useLikedTracks } from '@/hooks/use-ratings';
import { useSourceScope } from '@/hooks/use-source-scope';
import type { LibrarySearch, LibraryTab } from '@/routes/library/index';

const PREVIEW_LIMIT = 6;
const ARTIST_GRID = 'grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3 sm:gap-4';
const CARD_GRID = 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 sm:gap-3';

export function LibraryPage() {
  const { t } = useTranslation();
  const { source, tab } = useSearch({ from: '/library/' });
  const navigate = useNavigate({ from: '/library/' });
  const { albumIds, artistIds } = useSourceScope(source);
  const { data: playlists = [] } = useManualPlaylists();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: likedTracks = [] } = useLikedTracks();
  const { data: likedAlbumIds = [] } = useLikedAlbumIds();
  const { data: albumsByIds = [] } = useAlbumsByIds(likedAlbumIds);
  const likedAlbums = useMemo(() => likedAlbumIds.map((id) => albumsByIds.find((a) => a.id === id)).filter((a) => a != null), [likedAlbumIds, albumsByIds]);
  const { data: likedArtistIds = [] } = useLikedArtistIds();
  const { data: artistsByIds = [] } = useArtistsByIds(likedArtistIds);
  const likedArtists = useMemo(() => likedArtistIds.map((id) => artistsByIds.find((a) => a.id === id)).filter((a) => a != null), [likedArtistIds, artistsByIds]);

  const artists = useMemo(() => (artistIds ? likedArtists.filter((a) => artistIds.has(a.id)) : likedArtists), [likedArtists, artistIds]);
  const albums = useMemo(() => (albumIds ? likedAlbums.filter((a) => albumIds.has(a.id)) : likedAlbums), [likedAlbums, albumIds]);
  const tracks = useMemo(() => (source ? likedTracks.filter((tr) => tr.source === source) : likedTracks), [likedTracks, source]);

  const totalItems = likedArtists.length + likedAlbums.length + playlists.length + likedTracks.length;
  if (totalItems === 0) {
    return <LibraryEmptyState />;
  }

  const activeTab: LibraryTab = tab ?? 'all';
  const isAll = activeTab === 'all';
  const shows = (name: LibraryTab) => isAll || activeTab === name;
  const tabs = [
    { id: 'all' as const, label: t('LibraryPage.tabAll') },
    { id: 'artists' as const, label: t('LibraryPage.artists'), count: artists.length },
    { id: 'albums' as const, label: t('LibraryPage.albums'), count: albums.length },
    { id: 'playlists' as const, label: t('LibraryPage.playlists'), count: playlists.length },
    { id: 'tracks' as const, label: t('LibraryPage.tracks'), count: tracks.length },
  ];

  const emptyStates = {
    artists: { count: artists.length, title: 'LibraryPage.noLikedArtists', description: 'LibraryPage.startLikingArtists' },
    albums: { count: albums.length, title: 'LibraryPage.noLikedAlbums', description: 'LibraryPage.startLikingAlbums' },
    playlists: { count: playlists.length, title: 'LibraryPage.noPlaylists', description: 'LibraryPage.startAddingPlaylists' },
    tracks: { count: tracks.length, title: 'LibraryPage.noLikedTracks', description: 'LibraryPage.startLikingTracks' },
  } as const;
  const emptyTab = isAll ? (artists.length + albums.length + tracks.length + playlists.length === 0 ? { title: 'LibraryPage.emptyTitle', description: 'LibraryPage.emptyDescription' } : null) : emptyStates[activeTab].count === 0 ? emptyStates[activeTab] : null;

  return (
    <div>
      <div className="mb-[18px]">
        <SourceFilterBar value={source ?? 'all'} onChange={(next) => navigate({ search: (prev: LibrarySearch) => ({ ...prev, source: next === 'all' ? undefined : next }) })} />
      </div>
      <SectionTabs tabs={tabs} active={activeTab} onChange={(id) => navigate({ search: (prev: LibrarySearch) => ({ ...prev, tab: id === 'all' ? undefined : id }) })} />

      <div className="space-y-10">
        {shows('artists') && artists.length > 0 && (
          <Section title={t('LibraryPage.artists')} count={artists.length} bare={!isAll} action={isAll && artists.length > PREVIEW_LIMIT ? <SeeAllButton onClick={() => navigate({ search: (prev: LibrarySearch) => ({ ...prev, tab: 'artists' }) })} /> : undefined}>
            <CardGrid items={isAll ? artists.slice(0, PREVIEW_LIMIT) : artists} getKey={(artist) => artist.id} className={ARTIST_GRID} fallbackHeight={170}>
              {(artist) => <ArtistCard artist={artist} albumIds={albumIds} />}
            </CardGrid>
          </Section>
        )}

        {shows('albums') && albums.length > 0 && (
          <Section title={t('LibraryPage.albums')} count={albums.length} bare={!isAll} action={isAll && albums.length > PREVIEW_LIMIT ? <SeeAllButton onClick={() => navigate({ search: (prev: LibrarySearch) => ({ ...prev, tab: 'albums' }) })} /> : undefined}>
            <CardGrid items={isAll ? albums.slice(0, PREVIEW_LIMIT) : albums} getKey={(album) => album.id} className={CARD_GRID} fallbackHeight={246}>
              {(album) => <AlbumCard album={album} />}
            </CardGrid>
          </Section>
        )}

        {shows('playlists') && playlists.length > 0 && (
          <Section title={t('LibraryPage.playlists')} count={playlists.length} bare={!isAll}>
            <CardGrid items={playlists} getKey={(playlist) => playlist.id} className={CARD_GRID} fallbackHeight={246} trailing={<NewPlaylistCard onClick={() => setCreateOpen(true)} />}>
              {(playlist) => <PlaylistCard playlist={playlist} />}
            </CardGrid>
          </Section>
        )}

        {shows('tracks') && tracks.length > 0 && (
          <Section title={t('LibraryPage.tracks')} count={tracks.length} bare={!isAll} action={isAll && tracks.length > PREVIEW_LIMIT * 2 ? <SeeAllButton onClick={() => navigate({ search: (prev: LibrarySearch) => ({ ...prev, tab: 'tracks' }) })} /> : undefined}>
            <TrackGrid tracks={isAll ? tracks.slice(0, PREVIEW_LIMIT * 2) : tracks} provider="all" />
          </Section>
        )}

        {emptyTab && <EmptyTab title={t(emptyTab.title)} description={t(source ? 'LibraryPage.noSourceMatches' : emptyTab.description)} action={activeTab === 'playlists' ? <Button onClick={() => setCreateOpen(true)}>{t('CreatePlaylist.create')}</Button> : undefined} />}
      </div>

      <CreatePlaylistDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function SeeAllButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={onClick}>
      {t('LibraryPage.seeAll')}
      <ChevronRight className="ml-1 h-4 w-4" />
    </Button>
  );
}

function Section({ title, count, children, bare, action }: { title: string; count: number; children: React.ReactNode; bare?: boolean; action?: React.ReactNode }) {
  if (bare) {
    return (
      <section>
        {action && <div className="mb-3.5 flex justify-end">{action}</div>}
        {children}
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold tracking-[-0.01em]">
          {title}
          <span className="ml-1.5 text-xs font-medium text-muted-foreground">{count}</span>
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function LibraryEmptyState() {
  const { t } = useTranslation();
  const openAddMusic = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="rounded-full bg-muted p-6 mb-6">
        <Library className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{t('LibraryPage.emptyTitle')}</h3>
      <p className="text-muted-foreground mb-6 max-w-md">{t('LibraryPage.emptyDescription')}</p>
      <Button onClick={openAddMusic} size="lg">
        <Search className="mr-2 h-4 w-4" />
        {t('LibraryPage.searchForMusic')}
      </Button>
    </div>
  );
}
