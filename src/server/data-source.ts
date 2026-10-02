import { DataSource } from 'typeorm';
import { databaseOptions } from './database.js';

/** Entry point for the TypeORM CLI (`npm run migration:*`); not used by the server. */
export default new DataSource({ ...databaseOptions(), migrationsRun: false });
