import type { CreateDto, UpdateDto } from '@melody-manager/shared';
import type { RecordModel } from 'pocketbase';

export interface DatabaseService<T extends RecordModel> {
  getAllBy: (filter: string) => Promise<T[]>;
  getOne: (id: string) => Promise<T | null>;
  getOneBy: (filter: string) => Promise<T | null>;
  getOrCreate: (record: CreateDto<T>, filter: string) => Promise<T>;
  create: (record: CreateDto<T>) => Promise<T>;
  update: (id: T['id'], record: UpdateDto<T>) => Promise<T>;
  delete: (id: T['id']) => Promise<boolean>;
}
