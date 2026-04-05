import type { Playlist } from '@melody-manager/shared';
import { Link } from '@tanstack/react-router';
import { ListMusic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { getPlaylistCoverUrl } from '@/lib/cover-url';

interface Props {
  playlist: Playlist;
}

export function PlaylistCard({ playlist }: Props) {
  const { t } = useTranslation();
  const coverUrl = getPlaylistCoverUrl(playlist);
  const trackCount = playlist.tracks.length;

  return (
    <Link to="/playlists/$playlistId" params={{ playlistId: playlist.id }}>
      <Card className="group transition-all hover:shadow-lg hover:shadow-primary/10 cursor-pointer overflow-hidden p-0 gap-0 relative">
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
          {coverUrl ? <img src={coverUrl} alt={playlist.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <ListMusic className="h-1/3 w-1/3 text-primary/60" />}

          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>
        <CardContent className="px-1.5 py-1 sm:px-2 sm:py-1.5">
          <div className="flex flex-col gap-0 sm:gap-0.5">
            <h3 className="font-semibold text-[11px] sm:text-xs line-clamp-1">{playlist.name}</h3>
            <p className="hidden sm:block text-[11px] text-muted-foreground line-clamp-1">
              {trackCount} {t('PlaylistPage.tracks', { count: trackCount })}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
