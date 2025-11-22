import { albumsClient } from '@/clients/albums.client';
import { artistsClient } from '@/clients/artists.client';
import { playlistsClient } from '@/clients/playlists.client';
import { searchClient } from '@/clients/search.client';
import { tracksClient } from '@/clients/tracks.client';
import { TrackProviderFilter } from '@/components/providers/track-provider-filter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { CommandDialog, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProviders } from '@/hooks/use-providers';
import { formatDuration, getProviderColor } from '@/lib/utils';
import type { SearchResult, SearchType, TrackProvider } from '@melody-manager/shared';
import { isAlbumResult, isArtistResult, isPlaylistResult, isTrackResult } from '@melody-manager/shared';
import { Link } from '@tanstack/react-router';
import { Check, Disc, ExternalLink, Library, Loader2, Music, Plus, Settings, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Input } from '../ui/input';

export function AddMusicDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingUrls, setAddingUrls] = useState<Set<string>>(new Set());
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());
  const [selectedProvider, setSelectedProvider] = useState<TrackProvider | 'all'>('all');
  const [selectedType, setSelectedType] = useState<SearchType>('track');
  const { data: providers } = useProviders({ category: 'track', enabled: true });

  const hasEnabledProviders = providers && providers.length > 0;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setAddedUrls(new Set());
      setSelectedProvider('all');
      setSelectedType('track');
    }
  }, [open]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await searchClient.search(query, selectedType);
        setResults((response as { results: SearchResult[] }).results);
      } catch (error) {
        console.error('Search error:', error);
        toast.error('Failed to search');
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, selectedType]);

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

  const getLibraryStatus = (result: SearchResult) => {
    if (addedUrls.has(result.externalUrl)) {
      return { isInLibrary: true };
    }
    return result.libraryStatus || { isInLibrary: false };
  };

  const getItemProviderIds = useCallback(
    (result: SearchResult): string[] => {
      if (!providers) return [];
      const provider = providers.find((p) => p.type === result.provider);
      return provider ? [provider.id] : [];
    },
    [providers],
  );

  const providersWithResults = useMemo(() => {
    if (!results.length) return [];
    const providerTypes = new Set(results.map((r) => r.provider));
    return Array.from(providerTypes);
  }, [results]);

  const filteredResults = useMemo(() => {
    if (selectedProvider === 'all') {
      return results;
    }
    return results.filter((result) => result.provider === selectedProvider.type);
  }, [results, selectedProvider]);

  const renderSearchResult = (result: SearchResult, index: number) => {
    const status = getLibraryStatus(result);
    const isAdding = addingUrls.has(result.externalUrl);
    const isComplete = status.isInLibrary && !status.tracksInLibrary;
    const isPartial = status.tracksInLibrary && status.totalTracks && status.tracksInLibrary < status.totalTracks;

    let IconComponent = Music;
    let title = '';
    let subtitle = '';
    let image = '';

    if (isTrackResult(result)) {
      IconComponent = Music;
      title = result.title;
      subtitle = [result.artist, result.album, result.duration ? formatDuration(result.duration) : null].filter(Boolean).join(' • ');
      image = result.thumbnail || '';
    } else if (isAlbumResult(result)) {
      IconComponent = Disc;
      title = result.name;
      subtitle = [result.artist, result.trackCount ? `${result.trackCount} tracks` : null, result.releaseYear].filter(Boolean).join(' • ');
      image = result.coverUrl || '';
    } else if (isArtistResult(result)) {
      IconComponent = User;
      title = result.name;
      subtitle = [result.genres?.join(', '), result.albumCount ? `${result.albumCount} albums` : null, result.trackCount ? `${result.trackCount} tracks` : null].filter(Boolean).join(' • ');
      image = result.imageUrl || '';
    } else if (isPlaylistResult(result)) {
      IconComponent = Library;
      title = result.name;
      subtitle = [result.owner, result.trackCount ? `${result.trackCount} tracks` : null, result.description].filter(Boolean).join(' • ');
      image = result.coverUrl || '';
    }

    return (
      <CommandItem key={`${result.provider}-${result.externalUrl}-${index}`} value={title} className="flex items-center gap-3 p-3 transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-primary/50 data-[selected=true]:bg-secondary/60">
        <div className="flex-shrink-0">
          {image ? (
            <img src={image} alt={title} className="h-12 w-12 rounded object-cover" />
          ) : (
            <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
              <IconComponent className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-card-foreground truncate flex-1">{title}</p>
            <Badge variant="outline" className={`text-xs flex-shrink-0 ${getProviderColor(result.provider)}`}>
              {result.provider}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              window.open(result.externalUrl, '_blank');
            }}
            className="transition-colors w-9 h-9 p-0"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleAdd(result);
            }}
            disabled={isAdding || isComplete}
            variant={isComplete ? 'secondary' : 'default'}
            className="transition-all w-9 h-9 p-0"
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isComplete ? (
              <Check className="h-4 w-4" />
            ) : isPartial ? (
              <span className="text-xs font-medium">
                {status.tracksInLibrary}/{status.totalTracks}
              </span>
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CommandItem>
    );
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <div className="flex border-b px-3 py-2">
        <ButtonGroup className="flex-1">
          <Select value={selectedType} onValueChange={(value: string) => setSelectedType(value as SearchType)}>
            <SelectTrigger className="w-[130px] rounded-r-none border-0 shadow-none bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{t('GlobalSearch.searchFor')}</SelectLabel>
                <SelectItem value="track">
                  <div className="flex items-center gap-2 leading-none">
                    <Music className="h-4 w-4" />
                    <span className="leading-none">{t('GlobalSearch.tracks')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="album">
                  <div className="flex items-center gap-2 leading-none">
                    <Disc className="h-4 w-4" />
                    <span className="leading-none">{t('GlobalSearch.albums')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="artist">
                  <div className="flex items-center gap-2 leading-none">
                    <User className="h-4 w-4" />
                    <span className="leading-none">{t('GlobalSearch.artists')}</span>
                  </div>
                </SelectItem>
                <SelectItem value="playlist">
                  <div className="flex items-center gap-2 leading-none">
                    <Library className="h-4 w-4" />
                    <span className="leading-none">{t('GlobalSearch.playlists')}</span>
                  </div>
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input placeholder={t('GlobalSearch.searchForMusic')} value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 rounded-l-none border-0 shadow-none focus-visible:ring-0" autoFocus />
        </ButtonGroup>
      </div>
      <CommandList className="max-h-[500px] scrollbar-dialog-content">
        {!hasEnabledProviders && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="rounded-full bg-muted/50 p-4 mb-4">
              <Settings className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-base font-semibold text-card-foreground mb-1">{t('GlobalSearch.noProvidersConfigured')}</p>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">{t('GlobalSearch.configureOneProvider')}</p>
            <Link to="/admin/providers" onClick={() => setOpen(false)}>
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
            <p className="text-sm text-muted-foreground">{t('GlobalSearch.searchingTypes', { type: t(`GlobalSearch.${selectedType === 'playlist' ? 'playlists' : selectedType + 's'}`) })}</p>
          </div>
        )}

        {hasEnabledProviders && !isSearching && query && filteredResults.length === 0 && <CommandEmpty>{t('GlobalSearch.noTypesFound', { type: t(`GlobalSearch.${selectedType === 'playlist' ? 'playlists' : selectedType + 's'}`) })}</CommandEmpty>}

        {hasEnabledProviders && !isSearching && results.length > 0 && (
          <>
            {providersWithResults.length > 1 && (
              <div className="px-3 py-2 border-b">
                <TrackProviderFilter selectedProvider={selectedProvider} onProviderChange={setSelectedProvider} items={results} getItemProviderIds={getItemProviderIds} />
              </div>
            )}
            <CommandGroup heading={t('GlobalSearch.searchResults')}>{filteredResults.map(renderSearchResult)}</CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
