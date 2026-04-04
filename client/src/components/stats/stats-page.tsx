import type { Album, Artist, Track } from '@melody-manager/shared';
import { useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { BarChart3, ChevronRight, Clock, Disc3, Headphones, Music2, TrendingUp, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { albumCollection } from '@/collections/album.collection';
import { artistCollection } from '@/collections/artist.collection';
import { genreCollection } from '@/collections/genre.collection';
import { trackCollection } from '@/collections/track.collection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { config } from '@/lib/config';
import { getAlbumCoverUrl, getArtistImageUrl } from '@/lib/cover-url';
import { pb } from '@/lib/pocketbase';
import { formatListeningTime, formatMonth } from '@/lib/utils';

const CHART_COLORS = ['#7c3aed', '#c026d3', '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#f97316'];
interface StatsData {
  totalPlays: number;
  totalSeconds: number;
  uniqueTracks: number;
  uniqueArtists: number;
  topTracks: { trackId: string; count: number }[];
  topArtists: { artistId: string; count: number }[];
  topAlbums: { albumId: string; count: number }[];
  topGenres: { genreId: string; count: number }[];
  playsByMonth: { month: string; count: number }[];
}

export function StatsPage() {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTracks, setExpandedTracks] = useState(false);
  const [expandedArtists, setExpandedArtists] = useState(false);
  const [expandedAlbums, setExpandedAlbums] = useState(false);
  const { data: tracks = [] } = useLiveQuery((q) => q.from({ tracks: trackCollection }));
  const { data: albums = [] } = useLiveQuery((q) => q.from({ albums: albumCollection }));
  const { data: artists = [] } = useLiveQuery((q) => q.from({ artists: artistCollection }));
  const { data: genres = [] } = useLiveQuery((q) => q.from({ genres: genreCollection }));
  const trackMap = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const albumMap = useMemo(() => new Map(albums.map((album) => [album.id, album])), [albums]);
  const artistMap = useMemo(() => new Map(artists.map((artist) => [artist.id, artist])), [artists]);
  const genreMap = useMemo(() => new Map(genres.map((genre) => [genre.id, genre])), [genres]);
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${config.server.url}/stats/overview`, {
          headers: { Authorization: `Bearer ${pb.authStore.token}` },
        });
        if (response.ok) {
          setStats(await response.json());
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchStats();

    const collections = ['track_plays', 'tracks'];
    const unsubscribes = collections.map((col) => pb.collection(col).subscribe('*', () => fetchStats()));
    return () => {
      for (const unsub of unsubscribes) {
        unsub.then((fn) => fn());
      }
    };
  }, []);

  if (loading) {
    return null;
  }

  if (!stats || stats.totalPlays === 0) {
    return <StatsEmptyState />;
  }

  const { hours, minutes } = formatListeningTime(stats.totalSeconds);
  const formattedTime = hours > 0 ? `${hours}${t('StatsPage.hourShort')} ${minutes}${t('StatsPage.minuteShort')}` : `${minutes}${t('StatsPage.minuteShort')}`;
  const genreData = stats.topGenres.map(({ genreId, count }) => ({ name: genreMap.get(genreId)?.name ?? genreId, value: count })).filter((d) => d.name);
  const monthlyData = stats.playsByMonth.map(({ month, count }) => ({
    month: formatMonth(month, i18n.language),
    count,
  }));

  return (
    <div className="space-y-6 pb-48">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Headphones} label={t('StatsPage.totalPlays')} value={stats.totalPlays.toLocaleString()} />
        <StatCard icon={Clock} label={t('StatsPage.listeningTime')} value={formattedTime} />
        <StatCard icon={Music2} label={t('StatsPage.uniqueTracks')} value={stats.uniqueTracks.toLocaleString()} />
        <StatCard icon={Disc3} label={t('StatsPage.uniqueArtists')} value={stats.uniqueArtists.toLocaleString()} />
      </div>

      {monthlyData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              {t('StatsPage.playsByMonth')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={30} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-card-foreground)', fontSize: '13px' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#7c3aed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className={`grid grid-cols-1 ${stats.topArtists.length >= 3 ? 'lg:grid-cols-2' : ''} gap-6`}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" />
                {t('StatsPage.topTracks')}
              </CardTitle>
              {stats.topTracks.length > 5 && (
                <Button variant="ghost" size="sm" onClick={() => setExpandedTracks((prev) => !prev)} className="text-muted-foreground hover:text-foreground">
                  {expandedTracks ? t('LibraryPage.showLess') : t('LibraryPage.seeAll')}
                  <ChevronRight className={`ml-1 h-4 w-4 transition-transform ${expandedTracks ? 'rotate-90' : ''}`} />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="space-y-1">
              {(expandedTracks ? stats.topTracks : stats.topTracks.slice(0, 5)).map(({ trackId, count }, i) => {
                const track = trackMap.get(trackId);
                if (!track) {
                  return null;
                }

                return <TrackRow key={trackId} rank={i + 1} track={track} count={count} albumMap={albumMap} artistMap={artistMap} />;
              })}
            </div>
          </CardContent>
        </Card>

        {stats.topArtists.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4" />
                  {t('StatsPage.topArtists')}
                </CardTitle>
                {stats.topArtists.length > 5 && (
                  <Button variant="ghost" size="sm" onClick={() => setExpandedArtists((prev) => !prev)} className="text-muted-foreground hover:text-foreground">
                    {expandedArtists ? t('LibraryPage.showLess') : t('LibraryPage.seeAll')}
                    <ChevronRight className={`ml-1 h-4 w-4 transition-transform ${expandedArtists ? 'rotate-90' : ''}`} />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <div className="space-y-1">
                {(expandedArtists ? stats.topArtists : stats.topArtists.slice(0, 5)).map(({ artistId, count }, i) => {
                  const artist = artistMap.get(artistId);
                  if (!artist) {
                    return null;
                  }

                  return <ArtistRow key={artistId} rank={i + 1} artist={artist} count={count} />;
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className={`grid grid-cols-1 ${genreData.length >= 3 ? 'lg:grid-cols-2' : ''} gap-6`}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Disc3 className="h-4 w-4" />
                {t('StatsPage.topAlbums')}
              </CardTitle>
              {stats.topAlbums.length > 5 && (
                <Button variant="ghost" size="sm" onClick={() => setExpandedAlbums((prev) => !prev)} className="text-muted-foreground hover:text-foreground">
                  {expandedAlbums ? t('LibraryPage.showLess') : t('LibraryPage.seeAll')}
                  <ChevronRight className={`ml-1 h-4 w-4 transition-transform ${expandedAlbums ? 'rotate-90' : ''}`} />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="space-y-1">
              {(expandedAlbums ? stats.topAlbums : stats.topAlbums.slice(0, 5)).map(({ albumId, count }, i) => {
                const album = albumMap.get(albumId);
                if (!album) {
                  return null;
                }

                return <AlbumRow key={albumId} rank={i + 1} album={album} count={count} artistMap={artistMap} />;
              })}
            </div>
          </CardContent>
        </Card>

        {genreData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4" />
                {t('StatsPage.topGenres')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GenreChart data={genreData} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="rounded-md bg-primary/10 p-2">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[2rem] font-bold leading-none truncate">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function TrackRow({ rank, track, count, albumMap, artistMap }: { rank: number; track: Track; count: number; albumMap: Map<string, Album>; artistMap: Map<string, Artist> }) {
  const { playTrack, togglePlayPause, currentTrack, isPlaying, setQueue } = useMusicPlayer();
  const album = albumMap.get(track.album);
  const artistNames = track.artists
    .map((id) => artistMap.get(id)?.name)
    .filter(Boolean)
    .join(', ');
  const isCurrentTrack = currentTrack?.id === track.id;
  const handleClick = () => {
    if (isCurrentTrack) {
      togglePlayPause();
    } else {
      setQueue([track]);
      playTrack(track);
    }
  };

  return (
    <button type="button" className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors w-full text-left" onClick={handleClick}>
      <span className="text-xs font-medium text-muted-foreground w-5 text-right shrink-0">{rank}</span>
      <div className="h-9 w-9 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">{album && getAlbumCoverUrl(album) ? <img src={getAlbumCoverUrl(album)} alt={track.title} className="h-full w-full object-cover" /> : <Music2 className="h-3.5 w-3.5 text-muted-foreground" />}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isCurrentTrack && isPlaying ? 'text-primary' : ''}`}>{track.title}</p>
        <p className="text-xs text-muted-foreground truncate">{artistNames}</p>
      </div>
      <Badge variant="secondary" className="shrink-0 text-xs">
        {count}
      </Badge>
    </button>
  );
}

function ArtistRow({ rank, artist, count }: { rank: number; artist: Artist; count: number }) {
  return (
    <Link to="/artists/$artistId" params={{ artistId: artist.id }} className="flex items-center gap-3 hover:bg-muted/50 rounded-lg p-2 transition-colors">
      <span className="text-xs font-medium text-muted-foreground w-5 text-right shrink-0">{rank}</span>
      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">{getArtistImageUrl(artist) ? <img src={getArtistImageUrl(artist)} alt={artist.name} className="h-full w-full object-cover" /> : <User className="h-3.5 w-3.5 text-muted-foreground" />}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{artist.name}</p>
      </div>
      <Badge variant="secondary" className="shrink-0 text-xs">
        {count}
      </Badge>
    </Link>
  );
}

function AlbumRow({ rank, album, count, artistMap }: { rank: number; album: Album; count: number; artistMap: Map<string, Artist> }) {
  const artistNames = album.artists
    .map((id) => artistMap.get(id as unknown as string)?.name)
    .filter(Boolean)
    .join(', ');

  return (
    <Link to="/albums/$albumId" params={{ albumId: album.id }} className="flex items-center gap-3 hover:bg-muted/50 rounded-lg p-2 transition-colors">
      <span className="text-xs font-medium text-muted-foreground w-5 text-right shrink-0">{rank}</span>
      <div className="h-9 w-9 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">{getAlbumCoverUrl(album) ? <img src={getAlbumCoverUrl(album)} alt={album.name} className="h-full w-full object-cover" /> : <Disc3 className="h-3.5 w-3.5 text-muted-foreground" />}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{album.name}</p>
        <p className="text-xs text-muted-foreground truncate">{artistNames}</p>
      </div>
      <Badge variant="secondary" className="shrink-0 text-xs">
        {count}
      </Badge>
    </Link>
  );
}

function GenreChart({ data }: { data: { name: string; value: number }[] }) {
  const coloredData = data.map((d, i) => ({ ...d, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  return (
    <div className="flex flex-col lg:flex-row items-center gap-4">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={coloredData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={55} paddingAngle={2} strokeWidth={0} />
          <Tooltip contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-card-foreground)', fontSize: '13px' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {coloredData.map((item) => (
          <Badge key={item.name} variant="outline" className="gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.fill }} />
            {item.name} ({item.value})
          </Badge>
        ))}
      </div>
    </div>
  );
}

function StatsEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="rounded-full bg-muted p-6 mb-6">
        <BarChart3 className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{t('StatsPage.emptyTitle')}</h3>
      <p className="text-muted-foreground mb-6 max-w-md">{t('StatsPage.emptyDescription')}</p>
    </div>
  );
}
