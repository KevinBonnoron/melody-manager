import type { TrackLike } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';
import { pb, pbFilter } from '../lib/pocketbase';

export const trackLikeRepository = databaseRepositoryFactory(pb.collection<TrackLike>('track_likes'), {
  async getLikedTrackIdsByUser(userId: string): Promise<string[]> {
    const records = await pb.collection('track_likes').getFullList({
      filter: pbFilter('user = {:userId}', { userId }),
      fields: 'track',
    });
    return records.map((r) => r.track);
  },
});
