import { databaseServiceFactory } from '../factories';
import { artistRepository } from '../repositories';

export const artistService = databaseServiceFactory(artistRepository);
