import type { RecordModel, RecordService } from 'pocketbase';
import type { DatabaseRepository } from '../types';

interface FactoryOptions extends Record<string, unknown> {
  expand?: string;
}

export function databaseRepositoryFactory<T extends RecordModel, D>(recordService: RecordService<T>, options?: D & FactoryOptions): DatabaseRepository<T> & Omit<D, 'expand'> {
  const { expand, ...definition } = (options ?? {}) as FactoryOptions & Record<string, unknown>;

  const base: DatabaseRepository<T> = {
    async getOne(id) {
      return recordService.getOne(id, { expand }).catch(() => null);
    },

    async getOneBy(filter) {
      return recordService.getFirstListItem(filter, { expand }).catch(() => null);
    },

    async getAllBy(filter) {
      return recordService.getFullList({ filter, sort: '-created', expand }).catch(() => []);
    },

    async getOrCreate(record, filter) {
      const existing = await base.getOneBy(filter);
      return existing ? existing : base.create(record);
    },

    async create(record) {
      return recordService.create(record);
    },

    async update(id, record) {
      return recordService.update(id, record);
    },

    async delete(id) {
      return recordService.delete(id);
    },
  };

  return { ...base, ...definition } as DatabaseRepository<T> & Omit<D, 'expand'>;
}
