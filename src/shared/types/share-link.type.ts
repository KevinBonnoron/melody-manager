import type { PocketBaseRecord } from './pocketbase.type';

export interface ShareLink extends PocketBaseRecord {
  token: string;
  track: string;
  createdBy: string;
  expiresAt: string;
  plays: number;
}
