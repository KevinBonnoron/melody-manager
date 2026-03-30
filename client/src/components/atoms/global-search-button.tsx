import type { Album, Artist, Track } from '@melody-manager/shared';
import { useNavigate } from '@tanstack/react-router';
import type { IFuseOptions } from 'fuse.js';
import Fuse from 'fuse.js';
import { Disc, Heart, Music, Search, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useAlbums } from '@/hooks/use-album';
import { useAlbumLikes } from '@/hooks/use-album-likes';
import { useArtistLikes } from '@/hooks/use-artist-likes';
import { useArtists } from '@/hooks/use-artists';
import { useCommandDialog } from '@/hooks/use-command-dialog';
import { useTrackLikes } from '@/hooks/use-track-likes';
import { useTracks } from '@/hooks/use-tracks';
import { getAlbumCoverUrl, getArtistImageUrl } from '@/lib/cover-url';
import { cn, formatDuration, getModifierKey, getProviderColor } from '@/lib/utils';

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

export function GlobalSearchButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playTrackWithContext } = useMusicPlayer();
  const { open, setOpen, handleOpenChange } = useCommandDialog('f');
  const [query, setQuery] = useState('');

  const { data: tracks = [] } = useTracks();
  const { data: albums = [] } = useAlbums();
  const { data: artists = [] } = useArtists();
  const { isLiked: isTrackLiked, toggleLike: toggleTrackLike } = useTrackLikes();
  const { isLiked: isAlbumLiked, toggleLike: toggleAlbumLike } = useAlbumLikes();
  const { isLiked: isArtistLiked, toggleLike: toggleArtistLike } = useArtistLikes();

  const trackFuse = useMemo(() => (open ? new Fuse(tracks, trackFuseOptions) : null), [tracks, open]);
  const albumFuse = useMemo(() => (open ? new Fuse(albums, albumFuseOptions) : null), [albums, open]);
  const artistFuse = useMemo(() => (open ? new Fuse(artists, artistFuseOptions) : null), [artists, open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  const trimmedQuery = query.trim();

  const filteredTracks = useMemo(() => {
    if (!trimmedQuery || !trackFuse) {
      return [];
    }
    return trackFuse.search(trimmedQuery, { limit: 10 }).map((r) => r.item);
  }, [trackFuse, trimmedQuery]);

  const filteredAlbums = useMemo(() => {
    if (!trimmedQuery || !albumFuse) {
      return [];
    }
    return albumFuse.search(trimmedQuery, { limit: 5 }).map((r) => r.item);
  }, [albumFuse, trimmedQuery]);

  const filteredArtists = useMemo(() => {
    if (!trimmedQuery || !artistFuse) {
      return [];
    }
    return artistFuse.search(trimmedQuery, { limit: 5 }).map((r) => r.item);
  }, [artistFuse, trimmedQuery]);

  const hasResults = filteredTracks.length > 0 || filteredAlbums.length > 0 || filteredArtists.length > 0;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)} aria-label={t('AppLayout.search')}>
        <Search className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline">{t('AppLayout.search')}</span>
        <kbd className="ml-2 pointer-events-none hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">{getModifierKey('f')}</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={handleOpenChange} shouldFilter={false}>
        <CommandInput placeholder={t('GlobalSearch.typeToSearch')} value={query} onValueChange={setQuery} autoFocus />
        <CommandList className="max-h-[500px] scrollbar-dialog-content">
          {trimmedQuery && !hasResults && <CommandEmpty>{t('GlobalSearch.noResults')}</CommandEmpty>}

          {filteredArtists.length > 0 && (
            <CommandGroup heading={t('GlobalSearch.libraryArtists')}>
              {filteredArtists.map((artist) => (
                <CommandItem
                  key={artist.id}
                  value={artist.id}
                  onSelect={() => {
                    navigate({ to: '/artists/$artistId', params: { artistId: artist.id } });
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 p-3 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {getArtistImageUrl(artist) ? (
                      <img src={getArtistImageUrl(artist)} alt={artist.name} className="h-10 w-10 rounded-full object-cover" />
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
                  onSelect={() => {
                    navigate({ to: '/albums/$albumId', params: { albumId: album.id } });
                    setOpen(false);
                  }}
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
                  onSelect={() => {
                    playTrackWithContext(track, tracks);
                    setOpen(false);
                  }}
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
