import { databaseServiceFactory } from '../factories';
import { playlistRepository } from '../repositories';

export const playlistService = databaseServiceFactory(playlistRepository);
