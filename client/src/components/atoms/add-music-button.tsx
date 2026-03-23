import { albumsClient } from '@/clients/albums.client';
import { artistsClient } from '@/clients/artists.client';
import { playlistsClient } from '@/clients/playlists.client';
import { searchClient } from '@/clients/search.client';
import { tracksClient } from '@/clients/tracks.client';
import { TrackProviderFilter } from '@/components/providers/track-provider-filter';
import { Button } from '@/components/ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandList } from '@/components/ui/command';
import { useCommandDialog } from '@/hooks/use-command-dialog';
import { useProviders } from '@/hooks/use-providers';
import { getModifierKey } from '@/lib/utils';
import type { SearchResult, SearchType, TrackProvider } from '@melody-manager/shared';
import { isAlbumResult, isArtistResult, isPlaylistResult, isTrackResult } from '@melody-manager/shared';
import { Link } from '@tanstack/react-router';
import { Loader2, Plus, Settings } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlbumResultItem, ArtistResultItem, PlaylistResultItem, TrackResultItem } from './search-result-item';
import type { LibraryStatus } from './search-result-item';

const SEARCH_TYPES: SearchType[] = ['track', 'album', 'artist', 'playlist'];

export function AddMusicButton() {
  const { t } = useTranslation();
  const { open, setOpen, handleOpenChange } = useCommandDialog('k');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingUrls, setAddingUrls] = useState<Set<string>>(new Set());
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());
  const [selectedProvider, setSelectedProvider] = useState<TrackProvider | 'all'>('all');
  const { data: providers } = useProviders({ category: 'track', enabled: true });

  const hasEnabledProviders = providers && providers.length > 0;

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setAddedUrls(new Set());
      setSelectedProvider('all');
    }
  }, [open]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      setIsSearching(false);
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const responses = await Promise.all(SEARCH_TYPES.map((type) => searchClient.search(query, type, { signal: controller.signal })));
        if (!cancelled) {
          setResults(responses.flat());
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Search error:', error);
          toast.error(t('GlobalSearch.failedToSearch'));
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [query, t]);

  const handleAdd = async (result: SearchResult) => {
    setAddingUrls((prev) => new Set(prev).add(result.externalUrl));
    try {
      let title = '';
      let count = 0;

      if (isTrackResult(result)) {
        await tracksClient.addFromUrl(result.externalUrl);
        title = result.title;
        count = 1;
      } else if (isAlbumResult(result)) {
        const response = (await albumsClient.addFromUrl(result.externalUrl)) as { count: number };
        title = result.name;
        count = response.count || 0;
      } else if (isArtistResult(result)) {
        const response = (await artistsClient.addFromUrl(result.externalUrl)) as { count: number };
        title = result.name;
        count = response.count || 0;
      } else if (isPlaylistResult(result)) {
        const response = (await playlistsClient.addFromUrl(result.externalUrl)) as { count: number };
        title = result.name;
        count = response.count || 0;
      }

      setAddedUrls((prev) => new Set(prev).add(result.externalUrl));
      setResults((prev) => prev.map((r) => (r.externalUrl === result.externalUrl ? { ...r, libraryStatus: { ...r.libraryStatus, isInLibrary: true } } : r)));

      const message = count > 1 ? t('GlobalSearch.addedTracks', { count, title }) : t('GlobalSearch.addedSuccessfully', { title });
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('GlobalSearch.failedToAdd');
      toast.error(message);
    } finally {
      setAddingUrls((prev) => {
        const newSet = new Set(prev);
        newSet.delete(result.externalUrl);
        return newSet;
      });
    }
  };

  const getLibraryStatus = (result: SearchResult): LibraryStatus => {
    const status = result.libraryStatus || { isInLibrary: false };
    if (addedUrls.has(result.externalUrl)) {
      return { ...status, isInLibrary: true };
    }
    return status;
  };

  const getItemProviderIds = useCallback(
    (result: SearchResult): string[] => {
      if (!providers) {
        return [];
      }
      const provider = providers.find((p) => p.type === result.provider);
      return provider ? [provider.id] : [];
    },
    [providers],
  );

  const providersWithResults = useMemo(() => {
    if (!results.length) {
      return [];
    }
    const providerTypes = new Set(results.map((r) => r.provider));
    return Array.from(providerTypes);
  }, [results]);

  useEffect(() => {
    if (selectedProvider !== 'all' && providersWithResults.length > 0 && !providersWithResults.includes(selectedProvider.type)) {
      setSelectedProvider('all');
    }
  }, [providersWithResults, selectedProvider]);

  const filteredResults = useMemo(() => {
    if (selectedProvider === 'all') {
      return results;
    }
    return results.filter((result) => result.provider === selectedProvider.type);
  }, [results, selectedProvider]);

  const filteredArtists = useMemo(() => filteredResults.filter(isArtistResult), [filteredResults]);
  const filteredAlbums = useMemo(() => filteredResults.filter(isAlbumResult), [filteredResults]);
  const filteredTracks = useMemo(() => filteredResults.filter(isTrackResult), [filteredResults]);
  const filteredPlaylists = useMemo(() => filteredResults.filter(isPlaylistResult), [filteredResults]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)} aria-label={t('AppLayout.addMusic')}>
        <Plus className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline">{t('AppLayout.addMusic')}</span>
        <kbd className="ml-2 pointer-events-none hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">{getModifierKey('k')}</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={handleOpenChange} shouldFilter={false} className="sm:max-w-2xl">
        <CommandInput placeholder={t('GlobalSearch.searchForMusic')} value={query} onValueChange={setQuery} autoFocus />
        <CommandList className="max-h-[500px] scrollbar-dialog-content">
          {!hasEnabledProviders && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="rounded-full bg-muted/50 p-4 mb-4">
                <Settings className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-base font-semibold text-card-foreground mb-1">{t('GlobalSearch.noProvidersConfigured')}</p>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm">{t('GlobalSearch.configureOneProvider')}</p>
              <Link to="/providers" onClick={() => setOpen(false)}>
                <Button size="sm" variant="outline" className="transition-colors">
                  <Settings className="h-4 w-4 mr-2" />
                  {t('GlobalSearch.configureProviders')}
                </Button>
              </Link>
            </div>
          )}

          {hasEnabledProviders && isSearching && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">{t('GlobalSearch.searching')}</p>
            </div>
          )}

          {hasEnabledProviders && !isSearching && query && filteredResults.length === 0 && <CommandEmpty>{t('GlobalSearch.noResults')}</CommandEmpty>}

          {hasEnabledProviders && !isSearching && results.length > 0 && (
            <>
              {providersWithResults.length > 1 && (
                <div className="px-3 py-2 border-b">
                  <TrackProviderFilter selectedProvider={selectedProvider} onProviderChange={setSelectedProvider} items={results} getItemProviderIds={getItemProviderIds} />
                </div>
              )}

              {filteredTracks.length > 0 && (
                <CommandGroup heading={t('GlobalSearch.tracks')}>
                  {filteredTracks.map((result) => (
                    <TrackResultItem key={`track-${result.externalUrl}`} result={result} status={getLibraryStatus(result)} isAdding={addingUrls.has(result.externalUrl)} onAdd={() => handleAdd(result)} />
                  ))}
                </CommandGroup>
              )}

              {filteredAlbums.length > 0 && (
                <CommandGroup heading={t('GlobalSearch.albums')}>
                  {filteredAlbums.map((result) => (
                    <AlbumResultItem key={`album-${result.externalUrl}`} result={result} status={getLibraryStatus(result)} isAdding={addingUrls.has(result.externalUrl)} onAdd={() => handleAdd(result)} />
                  ))}
                </CommandGroup>
              )}

              {filteredPlaylists.length > 0 && (
                <CommandGroup heading={t('GlobalSearch.playlists')}>
                  {filteredPlaylists.map((result) => (
                    <PlaylistResultItem key={`playlist-${result.externalUrl}`} result={result} status={getLibraryStatus(result)} isAdding={addingUrls.has(result.externalUrl)} onAdd={() => handleAdd(result)} />
                  ))}
                </CommandGroup>
              )}

              {filteredArtists.length > 0 && (
                <CommandGroup heading={t('GlobalSearch.artists')}>
                  {filteredArtists.map((result) => (
                    <ArtistResultItem key={`artist-${result.externalUrl}`} result={result} status={getLibraryStatus(result)} isAdding={addingUrls.has(result.externalUrl)} onAdd={() => handleAdd(result)} />
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
