import { artistNames, useArtistsById } from '@/hooks/use-library-index';
import type { Track } from '@/shared';

interface Props {
  track: Track;
}

export function TrackArtistsCell({ track }: Props) {
  const artistsById = useArtistsById();
  return <div className="text-muted-foreground hidden md:table-cell">{artistNames(track.artists, artistsById)}</div>;
}
