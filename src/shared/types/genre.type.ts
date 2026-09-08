import type { RecordModel } from 'pocketbase';

export interface Genre extends RecordModel {
  name: string;
}
