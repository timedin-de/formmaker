import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { FormEntity, SubmissionEntity } from './entities/form.js';
import { UserEntity, SessionEntity } from './entities/user.js';

/** TypeORM datasource; select MySQL with DATABASE_PROVIDER=mysql. */
export async function createDatabase(): Promise<DataSource> {
  const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').toLowerCase();
  // TODO: SET DEFAULTS
  const synchronize = process.env.TYPEORM_SYNCHRONIZE !== 'false';
  let source: DataSource;

  if (provider === 'sqlite') {
    const filename = process.env.SQLITE_PATH ?? path.resolve('src/server/data/formmaker.sqlite');
    mkdirSync(path.dirname(filename), { recursive: true });
    source = new DataSource({
      type: 'better-sqlite3',
      database: filename,
      entities: [UserEntity, SessionEntity, FormEntity, SubmissionEntity],
      synchronize,
      logging: false,
    });
  } else if (provider === 'mysql') {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required when DATABASE_PROVIDER=mysql');
    source = new DataSource({
      type: 'mysql',
      url,
      entities: [UserEntity, SessionEntity, FormEntity, SubmissionEntity],
      synchronize,
      logging: false,
    });
  } else {
    throw new Error(`Unsupported DATABASE_PROVIDER: ${provider}`);
  }
  return source.initialize();
}
