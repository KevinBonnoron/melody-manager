import type { Track } from '@melody-manager/shared';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Clock, Headphones } from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useTrackDislikes } from '@/hooks/use-track-dislikes';
import { useTrackPlays } from '@/hooks/use-track-plays';
import { TrackArtistsCell } from './table/track-artists-cell';
import { TrackDurationCell } from './table/track-duration-cell';
import { TrackIndexButton } from './table/track-index-button';
import { TrackActionsCell } from './table/track-actions-cell';
import { TrackProviderCell } from './table/track-provider-cell';
import { TrackTitleCell } from './table/track-title-cell';

type TrackColumnDef = ColumnDef<Track> & {
  meta?: {
    className?: string;
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
        header: () => <div className="text-center">#</div>,
        cell: ({ row }) => <TrackIndexButton index={row.index + 1} track={row.original} contextTracks={queueableTracks} />,
        meta: {
          className: 'text-center w-12',
        },
        size: 48,
        enableSorting: false,
      },
      {
        accessorKey: 'title',
        header: t('AlbumTable.title'),
        cell: ({ row }) => <TrackTitleCell track={row.original} />,
        size: 300,
        enableSorting: false,
      },
      {
        id: 'artists',
        header: t('AlbumTable.artist'),
        cell: ({ row }) => <TrackArtistsCell track={row.original} />,
        meta: {
          className: 'hidden lg:table-cell',
        },
        size: 200,
        enableSorting: false,
      },
      {
        accessorKey: 'duration',
        header: () => (
          <div className="text-center">
            <Clock className="h-4 w-4 inline" />
          </div>
        ),
        cell: ({ row }) => <TrackDurationCell track={row.original} />,
        meta: {
          className: 'text-center',
        },
        size: 96,
        enableSorting: false,
      },
      {
        id: 'playCount',
        header: () => (
          <div className="text-center">
            <Headphones className="inline h-4 w-4" />
          </div>
        ),
        cell: ({ row }) => {
          const count = getPlayCount(row.original.id);
          return <div className="text-center text-muted-foreground text-sm">{count > 0 ? count : '—'}</div>;
        },
        meta: {
          className: 'text-center hidden sm:table-cell',
        },
        size: 72,
        enableSorting: false,
      },
      {
        id: 'provider',
        header: t('AlbumTable.provider'),
        cell: ({ row }) => <TrackProviderCell track={row.original} />,
        meta: {
          className: 'hidden xl:table-cell',
        },
        size: 120,
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => <div className="text-center">{t('AlbumTable.actions')}</div>,
        cell: ({ row }) => <TrackActionsCell track={row.original} />,
        meta: {
          className: 'text-center',
        },
        size: 120,
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
  const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) - virtualizer.options.scrollMargin : 0;
  const paddingBottom = virtualItems.length > 0 ? totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0) : 0;
  const columnCount = table.getHeaderGroups()[0]?.headers.length ?? columns.length;

  return (
    <div ref={tableContainerRef} className="border rounded-lg overflow-x-hidden">
      <Table className="table-fixed w-full">
        <TableHeader className="sticky top-0 bg-background z-10 border-b">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const columnDef = header.column.columnDef as TrackColumnDef;
                const isFlexColumn = header.column.id === 'title' || header.column.id === 'artists';
                const width = isFlexColumn ? undefined : header.column.getSize();
                return (
                  <TableHead key={header.id} className={columnDef.meta?.className} style={{ width: width ? `${width}px` : undefined }}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {paddingTop > 0 && (
            <tr>
              <td colSpan={columnCount} style={{ height: `${paddingTop}px`, padding: 0 }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index];
            const track = row.original;
            const isCurrentTrack = currentTrackId === track.id && isPlaying;
            const isTrackDisliked = isDisliked(track.id);

            return (
              <TableRow key={row.id} data-index={virtualRow.index} ref={virtualizer.measureElement} className={`group ${isTrackDisliked ? 'opacity-40 cursor-default' : 'cursor-pointer'} ${isCurrentTrack ? 'bg-primary/5' : ''}`} onClick={() => handleTrackClick(track)}>
                {row.getVisibleCells().map((cell) => {
                  const columnDef = cell.column.columnDef as TrackColumnDef;
                  return (
                    <TableCell key={cell.id} className={columnDef.meta?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
          {paddingBottom > 0 && (
            <tr>
              <td colSpan={columnCount} style={{ height: `${paddingBottom}px`, padding: 0 }} />
            </tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
