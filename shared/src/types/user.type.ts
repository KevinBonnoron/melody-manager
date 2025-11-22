import type { RecordModel } from 'pocketbase';

export interface User extends RecordModel {
  email: string;
  name: string;
  avatar?: string;
  role: 'user' | 'admin';
  verified: boolean;
  emailVisibility: boolean;
}
