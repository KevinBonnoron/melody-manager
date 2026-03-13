import type { Album, Artist, Track, TrackProvider } from '@melody-manager/shared';
import { Disc3, Heart, Music2, User } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlbumGrid } from '@/components/albums/album-grid';
import { ArtistGrid } from '@/components/artists/artist-grid';
import { TrackProviderFilter } from '@/components/providers/track-provider-filter';
import { TrackGrid } from '@/components/tracks/track-grid';
import { Badge } from '@/components/ui/badge';
import { useAlbumsByIds } from '@/hooks/use-album';
import { useLikedAlbumIds } from '@/hooks/use-album-likes';
import { useArtistsByIds } from '@/hooks/use-artists';
import { useLikedArtistIds } from '@/hooks/use-liked-artist-ids';
import { useLikedTracks } from '@/hooks/use-track-likes';
import { useTracks } from '@/hooks/use-tracks';

type FavoriteFilter = 'tracks' | 'albums' | 'artists';

export function FavoritesPage() {
  const { t } = useTranslation();
  const [typeFilter, setTypeFilter] = useState<FavoriteFilter | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<TrackProvider | 'all'>('all');

  const { data: allTracks = [] } = useTracks();
  const { data: likedTracks } = useLikedTracks();
  const { data: likedAlbumIds = [] } = useLikedAlbumIds();
  const { data: albumsByIds = [] } = useAlbumsByIds(likedAlbumIds);
  const likedAlbums = useMemo(() => likedAlbumIds.map((id) => albumsByIds.find((a) => a.id === id)).filter((a): a is Album => a != null), [likedAlbumIds, albumsByIds]);
  const { data: likedArtistIds = [] } = useLikedArtistIds();
  const { data: artistsByIds = [] } = useArtistsByIds(likedArtistIds);
  const likedArtists = useMemo(() => likedArtistIds.map((id) => artistsByIds.find((a) => a.id === id)).filter((a): a is Artist => a != null), [likedArtistIds, artistsByIds]);

  const providerIdsByAlbum = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const track of allTracks) {
      const list = map.get(track.album) ?? [];
      if (!list.includes(track.provider)) {
        list.push(track.provider);
      }
      map.set(track.album, list);
    }
    return map;
  }, [allTracks]);

  const providerIdsByArtist = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const track of allTracks) {
      for (const artistId of track.artists) {
        const list = map.get(artistId) ?? [];
        if (!list.includes(track.provider)) {
          list.push(track.provider);
        }
        map.set(artistId, list);
      }
    }
    return map;
  }, [allTracks]);

  const getTrackProviderIds = useCallback((track: Track) => [track.provider], []);
  const getAlbumProviderIds = useCallback((album: Album) => providerIdsByAlbum.get(album.id) ?? [], [providerIdsByAlbum]);
  const getArtistProviderIds = useCallback((artist: Artist) => providerIdsByArtist.get(artist.id) ?? [], [providerIdsByArtist]);

  const typeChips: { value: FavoriteFilter; label: string; count: number; icon: typeof Music2 }[] = [
    { value: 'artists', label: t('FavoritesPage.tabArtists'), count: likedArtists.length, icon: User },
    { value: 'albums', label: t('FavoritesPage.tabAlbums'), count: likedAlbums.length, icon: Disc3 },
    { value: 'tracks', label: t('FavoritesPage.tabTracks'), count: likedTracks.length, icon: Music2 },
  ];

  const toggleTypeFilter = (value: FavoriteFilter) => {
    setTypeFilter((prev) => (prev === value ? null : value));
  };

  const showSection = (type: FavoriteFilter) => typeFilter === null || typeFilter === type;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {typeChips.map(({ value, label, count, icon: Icon }) => {
          const isSelected = typeFilter === value;
          return (
            <Badge key={value} variant={isSelected ? 'default' : 'outline'} className="cursor-pointer transition-all hover:scale-105 py-1.5 px-3 text-sm" onClick={() => toggleTypeFilter(value)}>
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={isSelected ? 'opacity-90 ml-1' : 'text-muted-foreground ml-1'}>({count})</span>
            </Badge>
          );
        })}
      </div>

      {showSection('artists') && (
        <section className="mb-10">
          <h3 className="text-lg font-semibold mb-4">
            {t('FavoritesPage.tabArtists')}
            {likedArtists.length > 0 && <span className="ml-2 text-muted-foreground font-normal">({likedArtists.length})</span>}
          </h3>
          {likedArtists.length > 0 && (
            <div className="mb-4">
              <TrackProviderFilter selectedProvider={selectedProvider} onProviderChange={setSelectedProvider} items={likedArtists} getItemProviderIds={getArtistProviderIds} />
            </div>
          )}
          {likedArtists.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground rounded-lg border border-dashed">
              <Heart className="h-10 w-10 mb-3 opacity-50" />
              <p className="font-medium">{t('FavoritesPage.noLikedArtists')}</p>
              <p className="text-sm">{t('FavoritesPage.startLikingArtists')}</p>
            </div>
          ) : (
            <ArtistGrid artists={selectedProvider === 'all' ? likedArtists : likedArtists.filter((a) => providerIdsByArtist.get(a.id)?.includes(selectedProvider.id))} />
          )}
        </section>
      )}

      {showSection('albums') && (
        <section className="mb-10">
          <h3 className="text-lg font-semibold mb-4">
            {t('FavoritesPage.tabAlbums')}
            {likedAlbums.length > 0 && <span className="ml-2 text-muted-foreground font-normal">({likedAlbums.length})</span>}
          </h3>
          {likedAlbums.length > 0 && (
            <div className="mb-4">
              <TrackProviderFilter selectedProvider={selectedProvider} onProviderChange={setSelectedProvider} items={likedAlbums} getItemProviderIds={getAlbumProviderIds} />
            </div>
          )}
          {likedAlbums.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground rounded-lg border border-dashed">
              <Heart className="h-10 w-10 mb-3 opacity-50" />
              <p className="font-medium">{t('FavoritesPage.noLikedAlbums')}</p>
              <p className="text-sm">{t('FavoritesPage.startLikingAlbums')}</p>
            </div>
          ) : (
            <AlbumGrid albums={selectedProvider === 'all' ? likedAlbums : likedAlbums.filter((a) => providerIdsByAlbum.get(a.id)?.includes(selectedProvider.id))} />
          )}
        </section>
      )}

      {showSection('tracks') && (
        <section>
          <h3 className="text-lg font-semibold mb-4">
            {t('FavoritesPage.tabTracks')}
            {likedTracks.length > 0 && <span className="ml-2 text-muted-foreground font-normal">({likedTracks.length})</span>}
          </h3>
          {likedTracks.length > 0 && (
            <div className="mb-4">
              <TrackProviderFilter selectedProvider={selectedProvider} onProviderChange={setSelectedProvider} items={likedTracks} getItemProviderIds={getTrackProviderIds} />
            </div>
          )}
          {likedTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground rounded-lg border border-dashed">
              <Heart className="h-10 w-10 mb-3 opacity-50" />
              <p className="font-medium">{t('FavoritesPage.noLikedTracks')}</p>
              <p className="text-sm">{t('FavoritesPage.startLikingTracks')}</p>
            </div>
          ) : (
            <TrackGrid tracks={likedTracks} provider={selectedProvider} />
          )}
        </section>
      )}
    </div>
  );
}
