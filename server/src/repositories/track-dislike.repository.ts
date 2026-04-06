import type { TrackDislike } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';
import { pb, pbFilter } from '../lib/pocketbase';

export const trackDislikeRepository = databaseRepositoryFactory(pb.collection<TrackDislike>('track_dislikes'), {
  async getDislikedTrackIdsByUser(userId: string): Promise<string[]> {
    const records = await pb.collection('track_dislikes').getFullList({
      filter: pbFilter('user = {:userId}', { userId }),
      fields: 'track',
    });
    return records.map((r) => r.track);
  },
});
