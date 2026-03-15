import type { TrackPlay } from '@melody-manager/shared';
import { databaseRepositoryFactory } from '../factories';
import { pb, pbFilter } from '../lib/pocketbase';

export const trackPlayRepository = databaseRepositoryFactory(pb.collection<TrackPlay>('track_plays'), {
  async getCompletedTrackIdsByUser(userId: string): Promise<{ track: string; created: string }[]> {
    const records = await pb.collection('track_plays').getFullList({
      filter: pbFilter('user = {:userId} && completed = true', { userId }),
      fields: 'track,created',
    });
    return records as unknown as { track: string; created: string }[];
  },

  async getCompletedTrackCountsByUser(userId: string): Promise<{ track: string }[]> {
    const records = await pb.collection('track_plays').getFullList({
      filter: pbFilter('user = {:userId} && completed = true', { userId }),
      fields: 'track',
    });
    return records as unknown as { track: string }[];
  },
});
