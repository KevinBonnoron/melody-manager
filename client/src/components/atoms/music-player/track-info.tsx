import type { Track } from '@melody-manager/shared';
import { Link } from '@tanstack/react-router';
import { Music2 } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import Marquee from 'react-fast-marquee';

interface Props {
  track: Track;
}

export function TrackInfo({ track }: Props) {
  const titleRef = useRef<HTMLParagraphElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const prevTitleRef = useRef(track.title);

  useLayoutEffect(() => {
    if (prevTitleRef.current !== track.title) {
      prevTitleRef.current = track.title;
      setShouldScroll(false);
      return;
    }
    if (!shouldScroll && titleRef.current) {
      if (titleRef.current.scrollWidth > titleRef.current.clientWidth) {
        setShouldScroll(true);
      }
    }
  });

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="h-14 w-14 rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex-shrink-0">
        <Link to="/albums/$albumId" params={{ albumId: track.expand.album.id }}>
          {track.expand?.album?.coverUrl ? (
            <img src={track.expand.album.coverUrl} alt={track.title} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <Music2 className="h-6 w-6 text-primary/60" />
            </div>
          )}
        </Link>
      </div>
      <div className="min-w-0 flex-1">
        {shouldScroll ? (
          <Marquee gradient={false} speed={30} pauseOnHover className="font-semibold text-sm">
            <span className="mr-8">{track.title}</span>
          </Marquee>
        ) : (
          <p ref={titleRef} className="font-semibold text-sm truncate">
            {track.title}
          </p>
        )}
        <div className="text-xs text-muted-foreground line-clamp-1">
          {track.expand.artists.map((artist, index) => (
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
