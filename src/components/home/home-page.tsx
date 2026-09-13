import { ChevronRight, Music2, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlbumCard } from '@/components/albums/album-card';
import { ArtistCard } from '@/components/artists/artist-card';
import { CardSkeletonGrid } from '@/components/atoms/card-skeleton';
import { PlaylistCard } from '@/components/playlists/playlist-card';
import { Button } from '@/components/ui/button';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useAlbums } from '@/hooks/use-album';
import { useArtists } from '@/hooks/use-artists';
import { useDevices } from '@/hooks/use-devices';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { artistNames, useAlbumsById, useArtistsById } from '@/hooks/use-library-index';
import { usePlaybackState } from '@/hooks/use-playback-state';
import { useSmartPlaylists } from '@/hooks/use-playlists';
import { useTracks } from '@/hooks/use-tracks';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { formatDuration } from '@/lib/utils';
import type { Album, Artist, Playlist, Track } from '@/shared';

const RECENT_LIMIT = 6;
// Sideways on phones, a grid from md up, the children carry their own width so
// no wrapper element is needed and the cards keep their keys.
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
      <ContinueListening />

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

// Resume where playback stopped, on this device or another one: `currentTrack`
// is empty after a reload, so fall back to the position persisted server-side.
function ContinueListening() {
  const { t } = useTranslation();
  const { currentTrack, isPlaying, togglePlayPause, playTrack, setQueue } = useMusicPlayer();
  const { track: savedTrack, position, queueIds } = usePlaybackState();
  const { remoteActive } = useDevices();
  const { data: allTracks = [] } = useTracks();
  const albumsById = useAlbumsById();
  const artistsById = useArtistsById();

  const track = currentTrack ?? savedTrack;
  // Another device holding the playback already has the player bar; offering to
  // resume here on top of it would be two competing answers to the same thing.
  if (isPlaying || remoteActive || !track) {
    return null;
  }

  const startAt = position > 0 && position < track.duration - 5 ? position : 0;
  const album = albumsById.get(track.album);
  const coverUrl = album ? getAlbumCoverUrl(album) : undefined;
  const resume = () => {
    if (currentTrack) {
      togglePlayPause();
      return;
    }

    // A resumed track carries no queue, so nothing would follow it.
    const byId = new Map((allTracks as unknown as Track[]).map((t) => [t.id, t]));
    const restored = queueIds.map((id) => byId.get(id)).filter((t): t is Track => t !== undefined);
    if (restored.length > 0) {
      setQueue(restored);
    }

    playTrack(track, startAt);
  };
  const resumeLabel = t('HomePage.resumeAt', { time: formatDuration(startAt) });

  return (
    <button type="button" className="group flex items-center gap-3.5 p-3 w-full text-left rounded-xl bg-gradient-to-r from-primary/[0.14] to-transparent border border-primary-border cursor-pointer hover:from-primary/[0.2] transition-colors" onClick={resume}>
      <div className="h-14 w-14 sm:h-[72px] sm:w-[72px] rounded-lg overflow-hidden bg-muted shrink-0">
        {coverUrl ? (
          <img src={coverUrl} alt={track.title} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Music2 className="h-6 w-6 text-primary/60" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">{t('HomePage.continueListening')}</div>
        <div className="text-[15px] font-semibold tracking-tight truncate mt-0.5">{track.title}</div>
        <div className="text-[11.5px] text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
          <span>{artistNames(track.artists, artistsById)}</span>
          {album && (
            <>
              <span>·</span>
              <span>{album.name}</span>
            </>
          )}
        </div>
        {startAt > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-[3px] w-[180px] shrink-0 rounded-full bg-primary/15 overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (startAt / track.duration) * 100)}%` }} />
            </div>
            <span className="text-[10.5px] tabular-nums text-muted-foreground">{resumeLabel}</span>
          </div>
        )}
      </div>
      <span className="h-[42px] w-[42px] rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-[0_6px_20px_var(--primary-glow)] shrink-0 transition-transform group-hover:scale-105">
        <Play className="h-[18px] w-[18px] ml-0.5" fill="currentColor" />
      </span>
    </button>
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

  // On a phone the row is either scrolled sideways or short enough to read in
  // full, so the toggle only takes up space where space is scarcest.
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
