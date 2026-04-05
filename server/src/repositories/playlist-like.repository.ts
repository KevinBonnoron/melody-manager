import type { PlaylistLike } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';
import { pb } from '../lib/pocketbase';

export const playlistLikeRepository = databaseRepositoryFactory(pb.collection<PlaylistLike>('playlist_likes'), { expand: 'playlist' });
