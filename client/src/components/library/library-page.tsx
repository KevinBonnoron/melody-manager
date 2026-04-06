import type { Album, Artist } from '@melody-manager/shared';
import { ChevronRight, Library, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlbumCard } from '@/components/albums/album-card';
import { ArtistCard } from '@/components/artists/artist-card';
import { PlaylistCard } from '@/components/playlists/playlist-card';
import { TrackGrid } from '@/components/tracks/track-grid';
import { Button } from '@/components/ui/button';
import { useAlbumsByIds } from '@/hooks/use-album';
import { useLikedAlbumIds } from '@/hooks/use-album-likes';
import { useArtistsByIds } from '@/hooks/use-artists';
import { useLikedArtistIds } from '@/hooks/use-liked-artist-ids';
import { useManualPlaylists } from '@/hooks/use-playlists';
import { useLikedTracks } from '@/hooks/use-track-likes';

const PREVIEW_LIMIT = 6;
type ExpandedSection = 'artists' | 'albums' | 'playlists' | 'tracks' | null;

export function LibraryPage() {
  const { t } = useTranslation();
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
  const { data: playlists = [] } = useManualPlaylists();
  const { data: likedTracks = [] } = useLikedTracks();
  const { data: likedAlbumIds = [] } = useLikedAlbumIds();
  const { data: albumsByIds = [] } = useAlbumsByIds(likedAlbumIds);
  const likedAlbums = useMemo(() => likedAlbumIds.map((id) => albumsByIds.find((a) => a.id === id)).filter((a): a is Album => a != null), [likedAlbumIds, albumsByIds]);
  const { data: likedArtistIds = [] } = useLikedArtistIds();
  const { data: artistsByIds = [] } = useArtistsByIds(likedArtistIds);
  const likedArtists = useMemo(() => likedArtistIds.map((id) => artistsByIds.find((a) => a.id === id)).filter((a): a is Artist => a != null), [likedArtistIds, artistsByIds]);
  const toggleSection = (section: ExpandedSection) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const showSection = (section: ExpandedSection) => expandedSection === null || expandedSection === section;
  const totalItems = likedArtists.length + likedAlbums.length + playlists.length + likedTracks.length;
  if (totalItems === 0) {
    return <LibraryEmptyState />;
  }

  const artistsExpanded = expandedSection === 'artists';
  const albumsExpanded = expandedSection === 'albums';
  const playlistsExpanded = expandedSection === 'playlists';
  const tracksExpanded = expandedSection === 'tracks';
  const displayArtists = artistsExpanded ? likedArtists : likedArtists.slice(0, PREVIEW_LIMIT);
  const displayAlbums = albumsExpanded ? likedAlbums : likedAlbums.slice(0, PREVIEW_LIMIT);
  const displayPlaylists = playlistsExpanded ? playlists : playlists.slice(0, PREVIEW_LIMIT);
  const displayTracks = tracksExpanded ? likedTracks : likedTracks.slice(0, PREVIEW_LIMIT * 2);
  return (
    <div className="space-y-10 pb-48">
      {showSection('artists') && likedArtists.length > 0 && (
        <section>
          <SectionHeader title={t('LibraryPage.artists')} count={likedArtists.length} hasMore={likedArtists.length > PREVIEW_LIMIT} isExpanded={artistsExpanded} onToggle={() => toggleSection('artists')} />
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-3 sm:gap-4">
            {displayArtists.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        </section>
      )}

      {showSection('albums') && likedAlbums.length > 0 && (
        <section>
          <SectionHeader title={t('LibraryPage.albums')} count={likedAlbums.length} hasMore={likedAlbums.length > PREVIEW_LIMIT} isExpanded={albumsExpanded} onToggle={() => toggleSection('albums')} />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 sm:gap-3">
            {displayAlbums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      )}

      {showSection('playlists') && playlists.length > 0 && (
        <section>
          <SectionHeader title={t('LibraryPage.playlists')} count={playlists.length} hasMore={playlists.length > PREVIEW_LIMIT} isExpanded={playlistsExpanded} onToggle={() => toggleSection('playlists')} />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 sm:gap-3">
            {displayPlaylists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        </section>
      )}

      {showSection('tracks') && likedTracks.length > 0 && (
        <section>
          <SectionHeader title={t('LibraryPage.tracks')} count={likedTracks.length} hasMore={likedTracks.length > PREVIEW_LIMIT * 2} isExpanded={tracksExpanded} onToggle={() => toggleSection('tracks')} />
          <TrackGrid tracks={displayTracks} provider="all" />
        </section>
      )}
    </div>
  );
}

function SectionHeader({ title, count, hasMore, isExpanded, onToggle }: { title: string; count: number; hasMore: boolean; isExpanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold">
        {title}
        {count > 0 && <span className="ml-2 text-muted-foreground font-normal">({count})</span>}
      </h3>
      {hasMore && (
        <Button variant="ghost" size="sm" onClick={onToggle} className="text-muted-foreground hover:text-foreground">
          {isExpanded ? t('LibraryPage.showLess') : t('LibraryPage.seeAll')}
          <ChevronRight className={`ml-1 h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </Button>
      )}
    </div>
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
