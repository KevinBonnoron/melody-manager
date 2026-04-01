import type { Artist } from '@melody-manager/shared';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { User } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArtistCard } from './artist-card';

interface Props {
  artists: Artist[];
}

export function ArtistGrid({ artists }: Props) {
  const { t } = useTranslation();
  const [columns, setColumns] = useState(4);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setColumns(3);
      } else if (width < 768) {
        setColumns(4);
      } else if (width < 1024) {
        setColumns(5);
      } else if (width < 1280) {
        setColumns(6);
      } else if (width < 1536) {
        setColumns(7);
      } else {
        setColumns(8);
      }
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  const rows = useMemo(() => {
    const result: Artist[][] = [];
    for (let i = 0; i < artists.length; i += columns) {
      result.push(artists.slice(i, i + columns));
    }
    return result;
  }, [artists, columns]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 200,
    overscan: 3,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
  });

  if (artists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <User className="h-16 w-16 mb-4 opacity-20" />
        <p className="text-lg">{t('ArtistGrid.noArtistsFound')}</p>
        <p className="text-sm">{t('ArtistGrid.addMusicToSeeArtists')}</p>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={containerRef}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3 sm:gap-4 mb-2 sm:mb-4">
                {row.map((artist) => (
                  <ArtistCard key={artist.id} artist={artist} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
