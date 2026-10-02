import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { FormEntity, SubmissionEntity } from './entities/form.js';
import { UserEntity, SessionEntity } from './entities/user.js';
import { migrations } from './migrations/index.js';

/**
 * TypeORM options shared by the server and the migration CLI; select MySQL with
 * DATABASE_PROVIDER=mysql. The schema is only ever changed by migrations
 * (never `synchronize`). They run on startup unless TYPEORM_MIGRATIONS_RUN=false.
 */
export function databaseOptions(): DataSourceOptions {
  const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').toLowerCase();
  const common = {
    entities: [UserEntity, SessionEntity, FormEntity, SubmissionEntity],
    migrations,
    migrationsRun: process.env.TYPEORM_MIGRATIONS_RUN !== 'false',
    synchronize: false,
    logging: false,
  };

  if (provider === 'sqlite') {
    const filename = process.env.SQLITE_PATH ?? path.resolve('src/server/data/formmaker.sqlite');
    mkdirSync(path.dirname(filename), { recursive: true });
    return { ...common, type: 'better-sqlite3', database: filename };
  }
  if (provider === 'mysql') {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required when DATABASE_PROVIDER=mysql');
    return { ...common, type: 'mysql', url };
  }
  throw new Error(`Unsupported DATABASE_PROVIDER: ${provider}`);
}

export async function createDatabase(): Promise<DataSource> {
  return new DataSource(databaseOptions()).initialize();
}
