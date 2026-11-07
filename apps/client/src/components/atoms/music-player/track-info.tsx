import { Link } from '@tanstack/react-router';
import { Music2 } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import MarqueeExport from 'react-fast-marquee';
import { resolveAll, useAlbumsById, useArtistsById } from '@/hooks/use-library-index';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import type { Track } from '@/shared';

const Marquee = (MarqueeExport as unknown as { default?: typeof MarqueeExport }).default ?? MarqueeExport;

interface Props {
  track: Track | null;
  fallbackTitle?: string;
}

export function TrackInfo({ track, fallbackTitle }: Props) {
  const album = useAlbumsById().get(track?.album ?? '');
  const artists = resolveAll(track?.artists, useArtistsById());
  const title = track?.title ?? fallbackTitle ?? '';
  const trackRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the title is read through the DOM, and it is the signal that a new one has to be measured
  useLayoutEffect(() => {
    const container = trackRef.current;
    if (!container) {
      return;
    }

    const measure = () => setOverflows((probeRef.current?.scrollWidth ?? 0) > container.clientWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [title]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="h-11 w-11 @2xl:h-14 @2xl:w-14 rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex-shrink-0">
        {album && getAlbumCoverUrl(album) ? (
          <Link to="/albums/$albumId" params={{ albumId: album.id }}>
            <img src={getAlbumCoverUrl(album)} alt={title} className="h-full w-full object-cover" />
          </Link>
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Music2 className="h-6 w-6 text-primary/60" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div ref={trackRef} className="relative min-w-0">
          <span ref={probeRef} aria-hidden className="pointer-events-none invisible absolute whitespace-nowrap text-sm font-semibold">
            {title}
          </span>
          {overflows ? (
            <Marquee gradient={false} speed={30} pauseOnHover className="font-semibold text-sm">
              <span className="mr-8">{title}</span>
            </Marquee>
          ) : (
            <p className="font-semibold text-sm truncate">{title}</p>
          )}
        </div>
        <div className="text-xs text-muted-foreground line-clamp-1">
          {artists.map((artist, index) => (
            <span key={artist.id}>
              {index > 0 && ', '}
              <Link to="/artists/$artistId" params={{ artistId: artist.id }} className="hover:underline hover:text-foreground transition-colors">
                {artist.name}
              </Link>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
