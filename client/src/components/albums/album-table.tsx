import type { Track } from '@melody-manager/shared';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Clock, Headphones } from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useTrackDislikes } from '@/hooks/use-track-dislikes';
import { useTrackPlays } from '@/hooks/use-track-plays';
import { cn } from '@/lib/utils';
import { TrackActionsCell } from './table/track-actions-cell';
import { TrackArtistsCell } from './table/track-artists-cell';
import { TrackDurationCell } from './table/track-duration-cell';
import { TrackIndexButton } from './table/track-index-button';
import { TrackTitleCell } from './table/track-title-cell';

type TrackColumnDef = ColumnDef<Track> & {
  meta?: {
    className?: string;
    grow?: boolean;
  };
};

interface Props {
  tracks: Track[];
}

export function AlbumTable({ tracks }: Props) {
  const { t } = useTranslation();
  const { playTrackWithContext, togglePlayPause, currentTrack, isPlaying } = useMusicPlayer();
  const { isDisliked } = useTrackDislikes();
  const { getPlayCount } = useTrackPlays();
  const currentTrackId = currentTrack?.id;

  const queueableTracks = useMemo(() => tracks.filter((track) => !isDisliked(track.id)), [tracks, isDisliked]);

  const handleTrackClick = useCallback(
    (track: Track) => {
      if (isDisliked(track.id)) {
        return;
      }
      if (currentTrackId === track.id) {
        togglePlayPause();
      } else {
        playTrackWithContext(track, queueableTracks);
      }
    },
    [currentTrackId, togglePlayPause, queueableTracks, playTrackWithContext, isDisliked],
  );

  const columns: TrackColumnDef[] = useMemo(
    () => [
      {
        id: 'index',
        header: () => '#',
        cell: ({ row }) => <TrackIndexButton index={row.index + 1} track={row.original} contextTracks={queueableTracks} />,
        meta: {
          className: 'justify-center',
        },
        size: 48,
        enableSorting: false,
      },
      {
        accessorKey: 'title',
        header: t('AlbumTable.title'),
        cell: ({ row }) => <TrackTitleCell track={row.original} />,
        meta: {
          grow: true,
        },
        enableSorting: false,
      },
      {
        id: 'artists',
        header: t('AlbumTable.artist'),
        cell: ({ row }) => <TrackArtistsCell track={row.original} />,
        meta: {
          className: 'hidden lg:flex',
        },
        size: 200,
        enableSorting: false,
      },
      {
        accessorKey: 'duration',
        header: () => (
          <>
            <Clock className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('AlbumTable.duration')}</span>
          </>
        ),
        cell: ({ row }) => <TrackDurationCell track={row.original} />,
        meta: {
          className: 'justify-center',
        },
        size: 96,
        enableSorting: false,
      },
      {
        id: 'playCount',
        header: () => (
          <>
            <Headphones className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('AlbumTable.playCount')}</span>
          </>
        ),
        cell: ({ row }) => {
          const count = getPlayCount(row.original.id);
          return <span className="text-muted-foreground text-sm">{count > 0 ? count : '—'}</span>;
        },
        meta: {
          className: 'justify-center hidden sm:flex',
        },
        size: 72,
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => t('AlbumTable.actions'),
        cell: ({ row }) => <TrackActionsCell track={row.original} />,
        meta: {
          className: 'justify-center',
        },
        size: 128,
        enableSorting: false,
      },
    ],
    [queueableTracks, t, getPlayCount],
  );

  const table = useReactTable({
    data: tracks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows } = table.getRowModel();

  const tableContainerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 49,
    overscan: 5,
    scrollMargin: tableContainerRef.current?.offsetTop ?? 0,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={tableContainerRef} className="border rounded-lg overflow-hidden">
      <table className="grid w-full text-sm">
        <TableHeader className="sticky top-0 bg-background z-10 border-b grid">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="flex w-full items-center">
              {headerGroup.headers.map((header) => {
                const columnDef = header.column.columnDef as TrackColumnDef;
                const isGrow = columnDef.meta?.grow;
                const style = isGrow ? { flex: '1 1 0%', minWidth: 0 } : { width: header.column.getSize(), flex: 'none' };
                return (
                  <TableHead key={header.id} className={cn('flex items-center', columnDef.meta?.className)} style={style}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="grid relative" style={{ height: `${totalSize}px` }}>
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index];
            const track = row.original;
            const isCurrentTrack = currentTrackId === track.id && isPlaying;
            const isTrackDisliked = isDisliked(track.id);

            return (
              <TableRow
                key={row.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={`flex w-full items-center absolute group ${isTrackDisliked ? 'opacity-40 cursor-default' : 'cursor-pointer'} ${isCurrentTrack ? 'bg-primary/5' : ''}`}
                style={{ transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)` }}
                onClick={() => handleTrackClick(track)}
              >
                {row.getVisibleCells().map((cell) => {
                  const columnDef = cell.column.columnDef as TrackColumnDef;
                  const isGrow = columnDef.meta?.grow;
                  const style = isGrow ? { flex: '1 1 0%', minWidth: 0 } : { width: cell.column.getSize(), flex: 'none' };
                  return (
                    <TableCell key={cell.id} className={cn('flex items-center', columnDef.meta?.className)} style={style}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </table>
    </div>
  );
}
