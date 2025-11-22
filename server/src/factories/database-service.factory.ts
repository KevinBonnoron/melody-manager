import type { RecordModel } from 'pocketbase';
import type { DatabaseRepository, DatabaseService } from '../types';

export const databaseServiceFactory = <T extends RecordModel, D extends Record<string, unknown>>(repository: DatabaseRepository<T>, definition: D = {} as D): DatabaseService<T> & D => {
  return {
    async getAllBy(filter) {
      return repository.getAllBy(filter);
    },
    async getOne(id) {
      return repository.getOne(id);
    },
    async getOneBy(filter) {
      return repository.getOneBy(filter);
    },
    async getOrCreate(record, filter) {
      return repository.getOrCreate(record, filter);
    },
    async create(record) {
      return repository.create(record);
    },
    async update(id, record) {
      return repository.update(id, record);
    },
    async delete(id) {
      return repository.delete(id);
    },
    ...definition,
  };
};
