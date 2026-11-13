import type { Album, AlbumType } from '@/shared';

const LABEL_KEYS: Record<AlbumType, string> = {
  single: 'AlbumType.single',
  ep: 'AlbumType.ep',
  album: 'AlbumType.album',
  mix: 'AlbumType.mix',
};

export function albumTypeLabelKey(type: AlbumType): string {
  return LABEL_KEYS[type];
}

/** What an album is shown as when no kind is known: a regular album. */
export function effectiveAlbumType(album: Pick<Album, 'type'>): AlbumType {
  return album.type || 'album';
}

/** A type worth a label next to the album: a plain album needs none. */
export function distinctiveAlbumType(album: Pick<Album, 'type'>): AlbumType | null {
  return album.type && album.type !== 'album' ? album.type : null;
}
