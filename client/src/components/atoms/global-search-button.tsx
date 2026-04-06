import type { Album, Artist, Genre, Track, TrackProvider } from '@melody-manager/shared';
import { useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import type { IFuseOptions } from 'fuse.js';
import Fuse from 'fuse.js';
import { Clock, Disc, Heart, Music, Search, User, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { genreCollection } from '@/collections/genre.collection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useAlbums } from '@/hooks/use-album';
import { useAlbumLikes } from '@/hooks/use-album-likes';
import { useArtistLikes } from '@/hooks/use-artist-likes';
import { useArtists } from '@/hooks/use-artists';
import { useCommandDialog } from '@/hooks/use-command-dialog';
import { useProviders } from '@/hooks/use-providers';
import { useSearchHistory } from '@/hooks/use-search-history';
import { useTrackLikes } from '@/hooks/use-track-likes';
import { useTracks } from '@/hooks/use-tracks';
import { getAlbumCoverUrl, getArtistCoverUrl } from '@/lib/cover-url';
import { cn, formatDuration, getModifierKey, getProviderColor } from '@/lib/utils';
import { hasActiveFilters, type SearchFilters, SearchFiltersBar } from './search-filters';

const trackFuseOptions: IFuseOptions<Track> = {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'expand.artists.name', weight: 1.5 },
    { name: 'expand.album.name', weight: 1 },
  ],
  threshold: 0.4,
  includeScore: true,
};

const albumFuseOptions: IFuseOptions<Album> = {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'expand.artists.name', weight: 1.5 },
  ],
  threshold: 0.4,
  includeScore: true,
};

const artistFuseOptions: IFuseOptions<Artist> = {
  keys: [{ name: 'name', weight: 1 }],
  threshold: 0.4,
  includeScore: true,
};

function applyTrackFilters(tracks: Track[], filters: SearchFilters): Track[] {
  return tracks.filter((track) => {
    if (filters.provider && track.provider !== filters.provider) {
      return false;
    }

    if (filters.genre && !track.genres.includes(filters.genre)) {
      return false;
    }

    return true;
  });
}

export function GlobalSearchButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playTrackWithContext } = useMusicPlayer();
  const { open, setOpen, handleOpenChange } = useCommandDialog('f');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const { history, addEntry, removeEntry, clearHistory } = useSearchHistory();
  const { data: tracks = [] } = useTracks();
  const { data: albums = [] } = useAlbums();
  const { data: artists = [] } = useArtists();
  const { isLiked: isTrackLiked, toggleLike: toggleTrackLike } = useTrackLikes();
  const { isLiked: isAlbumLiked, toggleLike: toggleAlbumLike } = useAlbumLikes();
  const { isLiked: isArtistLiked, toggleLike: toggleArtistLike } = useArtistLikes();
  const { data: trackProviders = [] } = useProviders({ category: 'track', enabled: true });
  const { data: genres = [] } = useLiveQuery((q) => q.from({ genres: genreCollection }));
  const trackFuse = useMemo(() => new Fuse(tracks, trackFuseOptions), [tracks]);
  const albumFuse = useMemo(() => new Fuse(albums, albumFuseOptions), [albums]);
  const artistFuse = useMemo(() => new Fuse(artists, artistFuseOptions), [artists]);
  useEffect(() => {
    if (open) {
      setQuery('');
      setFilters({});
    }
  }, [open]);

  const trimmedQuery = query.trim();
  const filtersActive = hasActiveFilters(filters);
  const filteredTracks = useMemo(() => {
    if (!trackFuse) {
      return [];
    }

    let results: Track[];
    if (trimmedQuery) {
      results = trackFuse.search(trimmedQuery, { limit: 30 }).map((r) => r.item);
    } else if (filtersActive) {
      results = applyTrackFilters(tracks, filters).slice(0, 10);
      return results;
    } else {
      return [];
    }

    if (filtersActive) {
      results = applyTrackFilters(results, filters);
    }

    return results.slice(0, 10);
  }, [trackFuse, trimmedQuery, filters, filtersActive, tracks]);

  const filteredAlbums = useMemo(() => {
    // Don't show albums when provider/genre filter is active (those are track-level)
    if (filtersActive || !albumFuse || !trimmedQuery) {
      return [];
    }

    return albumFuse.search(trimmedQuery, { limit: 5 }).map((r) => r.item);
  }, [albumFuse, trimmedQuery, filtersActive]);

  const filteredArtists = useMemo(() => {
    // Don't show artists when provider/genre filter is active
    if (filtersActive || !artistFuse || !trimmedQuery) {
      return [];
    }

    return artistFuse.search(trimmedQuery, { limit: 5 }).map((r) => r.item);
  }, [artistFuse, trimmedQuery, filtersActive]);

  const hasResults = filteredTracks.length > 0 || filteredAlbums.length > 0 || filteredArtists.length > 0;
  const showHistory = !trimmedQuery && !filtersActive && history.length > 0;
  const handleSelect = useCallback(
    (action: () => void) => {
      const savedQuery = trimmedQuery;
      setOpen(false);
      action();
      if (savedQuery) {
        // Defer to avoid re-render during close animation
        setTimeout(() => addEntry(savedQuery), 200);
      }
    },
    [trimmedQuery, addEntry, setOpen],
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)} aria-label={t('AppLayout.search')}>
        <Search className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline">{t('AppLayout.search')}</span>
        <kbd className="ml-2 pointer-events-none hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">{getModifierKey('f')}</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={handleOpenChange} shouldFilter={false}>
        <CommandInput placeholder={t('GlobalSearch.typeToSearch')} value={query} onValueChange={setQuery} autoFocus />

        <SearchFiltersBar filters={filters} onChange={setFilters} providers={trackProviders as TrackProvider[]} genres={genres as Genre[]} />

        <CommandList className="max-h-[500px] scrollbar-dialog-content">
          {/* Search History */}
          {showHistory && (
            <CommandGroup heading={t('GlobalSearch.history.title')}>
              {history.map((entry) => (
                <CommandItem key={entry} value={`history-${entry}`} onSelect={() => setQuery(entry)} className="flex items-center gap-3 p-3 transition-colors">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 text-sm truncate">{entry}</span>
                  <button
                    type="button"
                    className="flex-shrink-0 p-1 rounded-md hover:bg-muted transition-colors"
                    aria-label={t('GlobalSearch.history.remove')}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeEntry(entry);
                    }}
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </CommandItem>
              ))}
              <CommandItem onSelect={clearHistory} className="justify-center text-xs text-muted-foreground p-2 transition-colors">
                {t('GlobalSearch.history.clear')}
              </CommandItem>
            </CommandGroup>
          )}

          {(trimmedQuery || filtersActive) && !hasResults && <CommandEmpty>{t('GlobalSearch.noResults')}</CommandEmpty>}

          {filteredArtists.length > 0 && (
            <CommandGroup heading={t('GlobalSearch.libraryArtists')}>
              {filteredArtists.map((artist) => (
                <CommandItem
                  key={artist.id}
                  value={artist.id}
                  onSelect={() =>
                    handleSelect(() => {
                      navigate({ to: '/artists/$artistId', params: { artistId: artist.id } });
                    })
                  }
                  className="flex items-center gap-3 p-3 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {getArtistCoverUrl(artist) ? (
                      <img src={getArtistCoverUrl(artist)} alt={artist.name} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{artist.name}</p>
                  </div>
                  <button
                    type="button"
                    className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors"
                    aria-label={isArtistLiked(artist.id) ? t('ArtistPage.following') : t('ArtistPage.follow')}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleArtistLike(artist.id);
                    }}
                  >
                    <Heart className={cn('h-4 w-4', isArtistLiked(artist.id) ? 'fill-primary text-primary' : 'text-muted-foreground')} />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {filteredAlbums.length > 0 && (
            <CommandGroup heading={t('GlobalSearch.libraryAlbums')}>
              {filteredAlbums.map((album) => (
                <CommandItem
                  key={album.id}
                  value={album.id}
                  onSelect={() =>
                    handleSelect(() => {
                      navigate({ to: '/albums/$albumId', params: { albumId: album.id } });
                    })
                  }
                  className="flex items-center gap-3 p-3 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {getAlbumCoverUrl(album) ? (
                      <img src={getAlbumCoverUrl(album)} alt={album.name} className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                        <Disc className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{album.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {album.expand?.artists?.map((a) => a.name).join(', ')}
                      {album.year && ` — ${album.year}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors"
                    aria-label={isAlbumLiked(album.id) ? t('AlbumPage.inLibrary') : t('AlbumPage.addToLibrary')}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAlbumLike(album.id);
                    }}
                  >
                    <Heart className={cn('h-4 w-4', isAlbumLiked(album.id) ? 'fill-primary text-primary' : 'text-muted-foreground')} />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {filteredTracks.length > 0 && (
            <CommandGroup heading={t('GlobalSearch.libraryTracks')}>
              {filteredTracks.map((track) => (
                <CommandItem
                  key={track.id}
                  value={track.id}
                  onSelect={() =>
                    handleSelect(() => {
                      playTrackWithContext(track, tracks);
                    })
                  }
                  className="flex items-center gap-3 p-3 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {track.expand.album && getAlbumCoverUrl(track.expand.album) ? (
                      <img src={getAlbumCoverUrl(track.expand.album)} alt={track.title} className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                        <Music className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {track.expand.artists?.map((a) => a.name).join(', ')}
                      {track.expand.album?.name && ` — ${track.expand.album.name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">{formatDuration(track.duration)}</span>
                    {track.expand?.provider?.type && (
                      <Badge variant="outline" className={`text-xs ${getProviderColor(track.expand.provider.type)}`}>
                        {track.expand.provider.type}
                      </Badge>
                    )}
                    <button
                      type="button"
                      className="p-1.5 rounded-md hover:bg-muted transition-colors"
                      aria-label={isTrackLiked(track.id) ? t('TrackActionsMenu.unlike') : t('TrackActionsMenu.like')}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTrackLike(track.id);
                      }}
                    >
                      <Heart className={cn('h-4 w-4', isTrackLiked(track.id) ? 'fill-primary text-primary' : 'text-muted-foreground')} />
                    </button>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
