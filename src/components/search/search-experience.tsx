import { Link, useNavigate } from '@tanstack/react-router';
import type { IFuseOptions } from 'fuse.js';
import Fuse from 'fuse.js';
import { ArrowRight, Clock, ExternalLink, Library, Link as LinkIcon, Loader2, Music2, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { albumsClient } from '@/clients/albums.client';
import { artistsClient } from '@/clients/artists.client';
import { playlistsClient } from '@/clients/playlists.client';
import { searchClient } from '@/clients/search.client';
import { tracksClient } from '@/clients/tracks.client';
import { Button } from '@/components/ui/button';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useActiveSources } from '@/hooks/use-active-sources';
import { useAlbums } from '@/hooks/use-album';
import { useArtists } from '@/hooks/use-artists';
import { useCapability } from '@/hooks/use-capability';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { artistNames, resolveAll, useArtistsById } from '@/hooks/use-library-index';
import { usePlugins } from '@/hooks/use-plugins';
import { useRecordSearch, useSearchHistory } from '@/hooks/use-search-history';
import { useTracks } from '@/hooks/use-tracks';
import { getAlbumCoverUrl, getArtistCoverUrl } from '@/lib/cover-url';
import { getSourceColor } from '@/lib/source-colors';
import { cn, formatDuration, getProviderColor } from '@/lib/utils';
import type { Album, Artist, SearchResult, SearchType, Track } from '@/shared';
import { isAlbumResult, isArtistResult, isPlaylistResult, isTrackResult } from '@/shared';

// A display filter, not a mode: 'all' shows the library and every provider at
// once, the others narrow that same result set.
type Scope = string;
const ALL: Scope = 'all';

// Artists are matched through the index rather than through a copy carried on
// the row: fuse reads each key with getFn, so the names it searches are the
// current ones and not a snapshot taken when the row was fetched.
const trackFuseOptions = (artistsById: Map<string, Artist>): IFuseOptions<Track> => ({
  keys: [
    { name: 'title', weight: 2 },
    { name: 'artists', weight: 1.5, getFn: (track) => resolveAll(track.artists, artistsById).map((artist) => artist.name) },
  ],
  threshold: 0.35,
});

const albumFuseOptions = (artistsById: Map<string, Artist>): IFuseOptions<Album> => ({
  keys: [
    { name: 'name', weight: 2 },
    { name: 'artists', weight: 1, getFn: (album) => resolveAll(album.artists, artistsById).map((artist) => artist.name) },
  ],
  threshold: 0.35,
});

const artistFuseOptions: IFuseOptions<Artist> = {
  keys: [{ name: 'name', weight: 1 }],
  threshold: 0.3,
};

// Every source the server can import from, not only the ones it can also search:
// pasting a Bandcamp link used to fall through to an external search that has no
// extractor to answer it, so the one thing the link was good for was never
// offered.
const IMPORT_URL_PATTERNS: [RegExp, string][] = [
  [/^https?:\/\/((www\.|m\.|music\.)?youtube\.com|youtu\.be)(\/|$)/i, 'youtube'],
  [/^https?:\/\/(www\.)?soundcloud\.com(\/|$)/i, 'soundcloud'],
  [/^https?:\/\/[a-z0-9-]+\.bandcamp\.com(\/|$)/i, 'bandcamp'],
];

function detectUrlSource(url: string): string | null {
  const t = url.trim();
  return IMPORT_URL_PATTERNS.find(([pattern]) => pattern.test(t))?.[1] ?? null;
}

const SEARCH_TYPES: SearchType[] = ['track', 'album', 'artist', 'playlist'];

const INDEX_SETTLE_MS = 400;

interface Props {
  // The overlay is a floating panel with its own chrome; the page sits in the
  // flow. Everything else, content, state, behaviour, is shared.
  variant?: 'overlay' | 'page';
  initialQuery?: string;
  onNavigate?: () => void;
}

export function SearchExperience({ variant = 'page', initialQuery = '', onNavigate }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playTrackWithContext } = useMusicPlayer();
  const [query, setQuery] = useState(initialQuery);
  // The router keeps this component mounted across a change of `q`, so without
  // this the address bar and the results disagree after a search opened from
  // somewhere else.
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);
  const [scope, setScope] = useState<Scope>(ALL);
  const { history, addEntry } = useSearchHistory();

  // Library data for local search
  const { data: tracks = [] } = useTracks();
  const { data: albums = [] } = useAlbums();
  const { data: artists = [] } = useArtists();
  const { trackProviders } = useActiveSources();
  const { manifests } = usePlugins();
  const capability = useCapability();
  // A connection unlocks *your* private content; searching a public catalogue
  // needs none, SoundCloud can be searched and imported from without one. What
  // does disqualify a source is missing the server config its manifest declares
  // search requires, like Spotify's app credentials.
  // Every source that can take a URL, whether or not it can be searched:
  // Bandcamp imports fine but has no search extractor, so it would otherwise be
  // invisible here despite being connected and usable.
  const importableNames = useMemo(() => trackProviders.filter((p) => p.type !== 'local' && manifests.find((m) => m.id === p.type)?.features.includes('import')).map((p) => manifests.find((m) => m.id === p.type)?.name ?? p.type), [trackProviders, manifests]);

  const searchableProviders = useMemo(() => trackProviders.filter((p) => p.type !== 'local' && manifests.find((m) => m.id === p.type)?.features.includes('search') && capability(p.type, 'search').available), [trackProviders, manifests, capability]);

  // The set, not its size: one provider replacing another leaves the count equal
  // and would keep the results the old one returned.
  const searchableTypes = useMemo(() => searchableProviders.map((p) => p.type).join(','), [searchableProviders]);

  // A scope names a provider, and a provider can stop being searchable while the
  // panel is open. Left alone, the chips would show nothing selected and every
  // list would be empty, with no way to tell what was filtering them.
  useEffect(() => {
    if (scope !== ALL && scope !== 'library' && !searchableProviders.some((p) => p.type === scope)) {
      setScope(ALL);
    }
  }, [scope, searchableProviders]);

  const artistsById = useArtistsById();
  // Indexing the whole library is the most expensive thing this screen does,
  // and every record an import writes arrives as its own realtime event. Held
  // still for a moment, the burst costs one rebuild instead of one per record.
  const indexed = useDebouncedValue(
    useMemo(() => ({ tracks, albums, artists, artistsById }), [tracks, albums, artists, artistsById]),
    INDEX_SETTLE_MS,
  );
  const trackFuse = useMemo(() => new Fuse(indexed.tracks, trackFuseOptions(indexed.artistsById)), [indexed]);
  const albumFuse = useMemo(() => new Fuse(indexed.albums, albumFuseOptions(indexed.artistsById)), [indexed]);
  const artistFuse = useMemo(() => new Fuse(indexed.artists, artistFuseOptions), [indexed]);

  // External search state
  const [externalResults, setExternalResults] = useState<SearchResult[]>([]);
  const [isSearchingExternal, setIsSearchingExternal] = useState(false);
  const [addingUrls, setAddingUrls] = useState<Set<string>>(new Set());
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());

  const trimmedQuery = query.trim();
  const urlMatch = useMemo(() => detectUrlSource(trimmedQuery), [trimmedQuery]);
  useRecordSearch(query, !urlMatch);

  // Library search results
  const libraryResults = useMemo(() => {
    if (!trimmedQuery || urlMatch || (scope !== ALL && scope !== 'library')) {
      return { tracks: [] as Track[], albums: [] as Album[], artists: [] as Artist[] };
    }

    return {
      tracks: trackFuse.search(trimmedQuery, { limit: 10 }).map((r) => r.item),
      albums: albumFuse.search(trimmedQuery, { limit: 5 }).map((r) => r.item),
      artists: artistFuse.search(trimmedQuery, { limit: 5 }).map((r) => r.item),
    };
  }, [trimmedQuery, urlMatch, scope, trackFuse, albumFuse, artistFuse]);

  const libraryCount = libraryResults.tracks.length + libraryResults.albums.length + libraryResults.artists.length;

  // External search
  useEffect(() => {
    // Four requests to providers that will all be skipped server-side is four
    // requests to find out what is already known here.
    if (!trimmedQuery || scope === 'library' || urlMatch || searchableTypes === '') {
      setExternalResults([]);
      setIsSearchingExternal(false);
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    setIsSearchingExternal(true);
    // A request that fails for any reason other than being cancelled would
    // otherwise leave the previous query's results under the new query.
    setExternalResults([]);

    const timeoutId = setTimeout(async () => {
      try {
        // Settled rather than all: the four requests are one per result type, and
        // a type that fails should cost its own results, not everybody else's.
        const responses = await Promise.allSettled(SEARCH_TYPES.map((type) => searchClient.search(trimmedQuery, type, { signal: controller.signal })));
        if (!cancelled) {
          setExternalResults(responses.flatMap((r) => (r.status === 'fulfilled' ? r.value.results : [])));
        }
      } catch {
        // Ignore abort errors
      } finally {
        if (!cancelled) {
          setIsSearchingExternal(false);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [trimmedQuery, scope, urlMatch, searchableTypes]);

  const handleAdd = useCallback(
    async (result: SearchResult) => {
      setAddingUrls((prev) => new Set(prev).add(result.origin));
      try {
        if (isTrackResult(result)) {
          await tracksClient.addFromUrl(result.origin);
        } else if (isAlbumResult(result)) {
          await albumsClient.addFromUrl(result.origin);
        } else if (isArtistResult(result)) {
          await artistsClient.addFromUrl(result.origin);
        } else if (isPlaylistResult(result)) {
          await playlistsClient.addFromUrl(result.origin);
        }

        setAddedUrls((prev) => new Set(prev).add(result.origin));
        toast.success(t('GlobalSearch.addedSuccessfully', { title: isTrackResult(result) ? result.title : (result as { name: string }).name }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('GlobalSearch.failedToAdd'));
      } finally {
        setAddingUrls((prev) => {
          const next = new Set(prev);
          next.delete(result.origin);
          return next;
        });
      }
    },
    [t],
  );

  const handleAddUrl = async () => {
    if (!trimmedQuery) {
      return;
    }

    try {
      await tracksClient.addFromUrl(trimmedQuery);
      toast.success(t('SearchPage.urlAdded'));
      setQuery('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('GlobalSearch.failedToAdd'));
    }
  };

  // Adding is the one action that leaves the search where it is: the palette
  // closes when it has taken you somewhere, and adding a track takes you
  // nowhere. Doing it with the mouse already behaved this way.
  const handleSelect = (action: () => void, keepOpen = false) => {
    if (trimmedQuery) {
      addEntry(trimmedQuery);
    }

    action();
    if (keepOpen) {
      return;
    }

    onNavigate?.();
  };

  const suggestedAlbums = useMemo(() => albums.slice(0, 4), [albums]);
  const visibleExternal = useMemo(() => (scope === ALL ? externalResults : externalResults.filter((r) => r.provider === scope)), [externalResults, scope]);

  // Selection is tracked by key, not index: a new query drops the old key and
  // the highlight falls back to the first row on its own.
  const items = useMemo<Array<{ key: string; run: () => void; keepOpen?: boolean }>>(
    () => [
      ...libraryResults.artists.map((artist) => ({ key: `artist-${artist.id}`, run: () => navigate({ to: '/artists/$artistId', params: { artistId: artist.id } }) })),
      ...libraryResults.albums.map((album) => ({ key: `album-${album.id}`, run: () => navigate({ to: '/albums/$albumId', params: { albumId: album.id } }) })),
      ...libraryResults.tracks.map((track) => ({ key: `track-${track.id}`, run: () => playTrackWithContext(track, libraryResults.tracks) })),
      // External results are part of the list the arrows walk. Enter does what
      // the row's own button does, which is to add it.
      ...visibleExternal.map((result) => ({ key: `external-${result.origin}`, run: () => handleAdd(result), keepOpen: true })),
    ],
    [libraryResults, visibleExternal, navigate, playTrackWithContext, handleAdd],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // The whole surface, not one of the two lists: arrow navigation runs through
  // the library results and the external ones alike.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cursor = Math.max(
    0,
    items.findIndex((item) => item.key === selectedKey),
  );
  const activeKey = items[cursor]?.key;

  useEffect(() => {
    if (activeKey) {
      surfaceRef.current?.querySelector(`[data-key="${CSS.escape(activeKey)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeKey]);

  return (
    // Arrows drive the selection wherever focus sits inside the search surface,
    // not only in the input. Scoped to the container rather than the document:
    // the page is not modal, and its own scrolling must keep working elsewhere.
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard-only container handler
    <div
      ref={surfaceRef}
      className={cn(variant === 'page' ? 'space-y-4' : 'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto')}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && variant === 'overlay') {
          onNavigate?.();
          return;
        }

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          // Keep the caret, and the focus ring, in the field: leaving focus on
          // a clicked chip made two indicators compete, one marking focus and
          // the other the selection.
          inputRef.current?.focus();
          if (items.length > 0) {
            const next = e.key === 'ArrowDown' ? cursor + 1 : cursor - 1;
            setSelectedKey(items[(next + items.length) % items.length].key);
          }
          return;
        }

        // A result row is a link, and Enter on a focused link is the link's own
        // gesture: intercepting it here would navigate somewhere else entirely.
        const focusedTag = document.activeElement?.tagName;
        if (e.key === 'Enter' && items[cursor] && focusedTag !== 'BUTTON' && focusedTag !== 'A') {
          e.preventDefault();
          handleSelect(items[cursor].run, items[cursor].keepOpen);
        }
      }}
    >
      {/* Search input */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-primary-border bg-card">
        <Search className="h-[18px] w-[18px] text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          // 16px at the smallest width: iOS Safari zooms the viewport when a
          // smaller input takes focus, and this one takes focus on arrival.
          className="flex-1 bg-transparent outline-none text-base sm:text-[15px] min-w-0 placeholder:text-muted-foreground"
          placeholder={t('SearchPage.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // biome-ignore lint/a11y/noAutofocus: a search surface exists to be typed into
          autoFocus
        />
        {query && (
          <button type="button" className="w-7 h-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50" onClick={() => setQuery('')} aria-label={t('SearchPage.clear')}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Scope tabs */}
      {!urlMatch && (
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-all whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                scope === ALL ? 'bg-muted/50 border-primary-border text-foreground' : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted/30',
              )}
              onClick={() => setScope(ALL)}
            >
              {t('LibraryPage.tabAll')}
            </button>

            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-all whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                scope === 'library' ? 'bg-muted/50 border-primary-border text-foreground' : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted/30',
              )}
              onClick={() => setScope(scope === 'library' ? ALL : 'library')}
            >
              <Library className="h-3.5 w-3.5" />
              {t('SearchPage.myLibrary')}
            </button>

            {searchableProviders.map((p) => {
              const isActive = scope === p.type;
              return (
                <button
                  type="button"
                  key={p.id}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-all whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    isActive ? 'bg-muted/50 border-primary-border text-foreground' : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted/30',
                  )}
                  onClick={() => setScope(isActive ? ALL : p.type)}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getSourceColor(p.type) }} />
                  {p.type.charAt(0).toUpperCase() + p.type.slice(1)}
                </button>
              );
            })}
          </div>

          {/* The palette is for finding one thing quickly; the page is where a
              search is worth spreading out. The query travels with it. */}
          {variant === 'overlay' && trimmedQuery && (
            <Link to="/search" search={{ q: trimmedQuery }} onClick={() => onNavigate?.()} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground">
              {t('GlobalSearch.openPage')}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      {/* URL detected, import card */}
      {urlMatch && (
        <div className="rounded-xl border border-primary-border bg-card p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{t('SearchPage.linkDetected')}</span>
          </div>
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border border-border">
            <div className="w-14 h-14 rounded-lg grid place-items-center shrink-0" style={{ background: `linear-gradient(135deg, ${getSourceColor(urlMatch)}55, ${getSourceColor(urlMatch)}22)` }}>
              <Music2 className="h-5 w-5 text-foreground/90" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm">{t('SearchPage.readyToImport')}</div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">{trimmedQuery.length > 60 ? `${trimmedQuery.slice(0, 60)}…` : trimmedQuery}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddUrl}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t('SearchPage.addToLibrary')}
            </Button>
          </div>
        </div>
      )}

      {/* Empty state, no query */}
      {!trimmedQuery && !urlMatch && (
        <div className="space-y-6 pt-2">
          {/* Recent searches */}
          {history.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-[10.5px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">{t('SearchPage.recentSearches')}</div>
              <div className="flex flex-wrap gap-1.5">
                {history.slice(0, 6).map((entry) => (
                  <button type="button" key={entry} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs text-muted-foreground bg-muted/30 hover:bg-muted/50 transition-colors" onClick={() => setQuery(entry)}>
                    <Clock className="h-3 w-3" />
                    {entry}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {suggestedAlbums.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-[10.5px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">{t('SearchPage.suggestions')}</div>
              <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                {suggestedAlbums.map((album) => (
                  <button type="button" key={album.id} className="flex items-center gap-2.5 p-2 rounded-lg text-left hover:bg-muted/30 transition-colors" onClick={() => handleSelect(() => navigate({ to: '/albums/$albumId', params: { albumId: album.id } }))}>
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-muted shrink-0">
                      {getAlbumCoverUrl(album) ? (
                        <img src={getAlbumCoverUrl(album)} alt={album.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center">
                          <Music2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{album.name}</div>
                      <div className="text-[10.5px] text-muted-foreground truncate">{artistNames(album.artists, artistsById)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* URL hint */}
          <div className="flex items-center gap-2 px-3 py-2 text-[11.5px] text-muted-foreground italic">
            <LinkIcon className="h-3.5 w-3.5 shrink-0" />
            {t('SearchPage.urlHint', { sources: importableNames.join(', ') })}
          </div>
        </div>
      )}

      {/* Library results */}
      {trimmedQuery && !urlMatch && (scope === ALL || scope === 'library') && (
        <div className="space-y-4">
          {libraryResults.artists.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10.5px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
                {t('SearchPage.artists')} · {libraryResults.artists.length}
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {libraryResults.artists.map((artist) => (
                  <button
                    type="button"
                    key={artist.id}
                    data-key={`artist-${artist.id}`}
                    className={cn('flex flex-col items-center gap-1.5 p-1 rounded-lg min-w-[76px]', activeKey === `artist-${artist.id}` && 'bg-muted/40 ring-1 ring-inset ring-primary/50')}
                    onClick={() => handleSelect(() => navigate({ to: '/artists/$artistId', params: { artistId: artist.id } }))}
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-muted">
                      {getArtistCoverUrl(artist) ? <img src={getArtistCoverUrl(artist)} className="w-full h-full object-cover" alt={artist.name} /> : <div className="w-full h-full grid place-items-center text-muted-foreground text-lg font-semibold">{artist.name[0]}</div>}
                    </div>
                    <span className="text-[11.5px] text-center truncate max-w-[76px]">{artist.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {libraryResults.albums.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10.5px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
                {t('SearchPage.albums')} · {libraryResults.albums.length}
              </div>
              <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
                {libraryResults.albums.map((album) => (
                  <button
                    type="button"
                    key={album.id}
                    data-key={`album-${album.id}`}
                    className={cn('flex items-center gap-2.5 w-full p-2 rounded-lg text-left transition-colors hover:bg-muted/30', activeKey === `album-${album.id}` && 'bg-muted/40 ring-1 ring-inset ring-primary/50')}
                    onClick={() => handleSelect(() => navigate({ to: '/albums/$albumId', params: { albumId: album.id } }))}
                  >
                    <div className="w-11 h-11 rounded-md overflow-hidden bg-muted shrink-0">
                      {getAlbumCoverUrl(album) ? (
                        <img src={getAlbumCoverUrl(album)} className="w-full h-full object-cover" alt={album.name} />
                      ) : (
                        <div className="w-full h-full grid place-items-center">
                          <Music2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{album.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Album · {artistNames(album.artists, artistsById)}
                        {album.year != null ? ` · ${album.year}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {libraryResults.tracks.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10.5px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
                {t('SearchPage.tracks')} · {libraryResults.tracks.length}
              </div>
              <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
                {libraryResults.tracks.map((track) => (
                  <button
                    type="button"
                    key={track.id}
                    data-key={`track-${track.id}`}
                    className={cn('flex items-center gap-2.5 w-full p-2 rounded-lg text-left transition-colors hover:bg-muted/30', activeKey === `track-${track.id}` && 'bg-muted/40 ring-1 ring-inset ring-primary/50')}
                    onClick={() => handleSelect(() => playTrackWithContext(track, libraryResults.tracks))}
                  >
                    <div className="w-10 h-10 rounded-md bg-muted grid place-items-center shrink-0 text-muted-foreground">
                      <Music2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{track.title}</div>
                      <div className="text-[11px] text-muted-foreground">{artistNames(track.artists, artistsById)}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums shrink-0">{formatDuration(track.duration)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {libraryCount === 0 && <div className="py-6 text-center text-sm text-muted-foreground">{t('SearchPage.noLibraryResults', { query: trimmedQuery })}</div>}
        </div>
      )}

      {/* External results */}
      {trimmedQuery && !urlMatch && scope !== 'library' && (
        <div className="space-y-2">
          <div className="text-[10.5px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">{t('SearchPage.externalResults')}</div>
          {isSearchingExternal && (
            <div className="flex items-center gap-2 px-1 py-2 text-[12.5px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('GlobalSearch.searching')}
            </div>
          )}

          {!isSearchingExternal && visibleExternal.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">{t('GlobalSearch.noResults')}</div>}

          {/* Around 250px of a row is taken before the title starts: thumbnail,
              provider, link and button. A column narrower than this leaves
              nothing but an ellipsis, so it is better to have one fewer. */}
          <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(520px,1fr))]">
            {!isSearchingExternal &&
              visibleExternal.map((result) => {
                const title = isTrackResult(result) ? result.title : (result as { name: string }).name;
                const subtitle = isTrackResult(result) ? [result.artist, result.album].filter(Boolean).join(' · ') : isAlbumResult(result) ? result.artist : isArtistResult(result) ? (result.genres?.join(', ') ?? '') : '';
                const image = result.coverUrl;
                const isAdding = addingUrls.has(result.origin);
                const isAdded = addedUrls.has(result.origin) || result.libraryStatus?.isInLibrary;

                return (
                  <div key={result.origin} data-key={`external-${result.origin}`} className={cn('flex items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-muted/30', activeKey === `external-${result.origin}` && 'bg-muted/40 ring-1 ring-inset ring-primary/50')}>
                    <div className="w-11 h-11 rounded-md overflow-hidden bg-muted shrink-0 grid place-items-center" style={{ background: image ? undefined : `linear-gradient(135deg, ${getSourceColor(result.provider)}44, ${getSourceColor(result.provider)}18)` }}>
                      {image ? <img src={image} alt={title} className="w-full h-full object-cover" /> : <Music2 className="h-4 w-4 text-foreground/70" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{title}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {subtitle}
                        {isTrackResult(result) && result.duration ? ` · ${formatDuration(result.duration)}` : ''}
                      </div>
                    </div>
                    <span className={`w-[76px] shrink-0 rounded border px-1.5 py-0.5 text-center text-[10px] ${getProviderColor(result.provider)}`}>{result.provider}</span>
                    {/* The result names where it came from; being able to go and
                        look before adding it is the point of a search. */}
                    <a
                      href={result.origin}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                      title={t('SearchPage.openSource')}
                      aria-label={t('SearchPage.openSource')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {/* One width whether it invites or reports: an "Added" that
                        takes less room than "Add" pulls every row out of line. */}
                    <Button size="sm" variant={isAdded ? 'ghost' : 'default'} className="h-8 w-[104px] shrink-0 px-2.5" disabled={isAdding || !!isAdded} onClick={() => handleAdd(result)}>
                      {isAdding ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isAdded ? (
                        <span className="text-xs">{t('SearchPage.added')}</span>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          <span className="text-xs">{t('SearchPage.add')}</span>
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
