import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMusicPlayer } from '@/contexts/music-player-context';
import type { Track } from '@melody-manager/shared';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Clock } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrackArtistsCell } from './table/track-artists-cell';
import { TrackDurationCell } from './table/track-duration-cell';
import { TrackIndexButton } from './table/track-index-button';
import { TrackLikeCell } from './table/track-like-cell';
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
  const currentTrackId = currentTrack?.id;

  const handleTrackClick = useCallback(
    (track: Track) => {
      if (currentTrackId === track.id) {
        togglePlayPause();
      } else {
        playTrackWithContext(track, tracks);
      }
    },
    [currentTrackId, togglePlayPause, tracks, playTrackWithContext],
  );

  const columns: TrackColumnDef[] = useMemo(
    () => [
      {
        id: 'index',
        header: () => <div className="text-center">#</div>,
        cell: ({ row }) => <TrackIndexButton index={row.index + 1} track={row.original} contextTracks={tracks} />,
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
        cell: ({ row }) => <TrackLikeCell track={row.original} />,
        meta: {
          className: 'text-center',
        },
        size: 48,
        enableSorting: false,
      },
    ],
    [tracks, t],
  );

  const table = useReactTable({
    data: tracks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows } = table.getRowModel();

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 49,
    overscan: 100,
    scrollMargin: 0,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom = virtualItems.length > 0 ? totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0) : 0;
  const columnCount = table.getHeaderGroups()[0]?.headers.length ?? columns.length;

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10 border-b">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const columnDef = header.column.columnDef as TrackColumnDef;
                const width = header.column.getSize();
                return (
                  <TableHead key={header.id} className={columnDef.meta?.className} style={{ width: width ? `${width}px` : undefined, minWidth: width ? `${width}px` : undefined, maxWidth: width ? `${width}px` : undefined }}>
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

            return (
              <TableRow key={row.id} data-index={virtualRow.index} ref={virtualizer.measureElement} className={`group cursor-pointer ${isCurrentTrack ? 'bg-primary/5' : ''}`} onClick={() => handleTrackClick(track)}>
                {row.getVisibleCells().map((cell) => {
                  const columnDef = cell.column.columnDef as TrackColumnDef;
                  const width = cell.column.getSize();
                  return (
                    <TableCell key={cell.id} className={columnDef.meta?.className} style={{ width: width ? `${width}px` : undefined, minWidth: width ? `${width}px` : undefined, maxWidth: width ? `${width}px` : undefined }}>
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
