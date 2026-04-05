import type { Playlist } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';
import { pb } from '../lib/pocketbase';

export const playlistRepository = databaseRepositoryFactory(pb.collection<Playlist>('playlists'), { expand: 'tracks,tracks.artists,tracks.album,tracks.provider' });
