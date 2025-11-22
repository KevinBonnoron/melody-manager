import { databaseServiceFactory } from '../factories';
import { albumRepository } from '../repositories';

export const albumService = databaseServiceFactory(albumRepository);
