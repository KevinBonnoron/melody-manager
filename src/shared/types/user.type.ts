import type { PocketBaseRecord } from './pocketbase.type';

export interface User extends PocketBaseRecord {
  email: string;
  name: string;
  avatar?: string;
  role: 'user' | 'admin';
  verified: boolean;
  emailVisibility: boolean;
  onboardingDone?: boolean;
}
