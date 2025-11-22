import type { Track } from '@melody-manager/shared';

export type AlbumDownloadStatus = 'none' | 'partial' | 'complete';

export function getAlbumDownloadStatus(tracks: Track[]): { status: AlbumDownloadStatus; downloaded: number; total: number } {
  const total = tracks.length;
  if (total === 0) {
    return { status: 'none', downloaded: 0, total: 0 };
  }

  const downloaded = tracks.filter((track) => track.metadata?.localPath).length;
  if (downloaded === 0) {
    return { status: 'none', downloaded, total };
  }

  if (downloaded === total) {
    return { status: 'complete', downloaded, total };
  }

  return { status: 'partial', downloaded, total };
}
