import type { RecordModel } from 'pocketbase';

export interface Expand<T> extends RecordModel {
  expand: {
    [K in keyof T]: T[K];
  };
}
