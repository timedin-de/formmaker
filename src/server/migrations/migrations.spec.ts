import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { FormEntity, SubmissionEntity } from '../entities/form.js';
import { SessionEntity, UserEntity } from '../entities/user.js';
import { migrations } from './index.js';

function source(synchronize: boolean): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [UserEntity, SessionEntity, FormEntity, SubmissionEntity],
    migrations,
    synchronize,
  });
}

const tables = ['forms', 'sessions', 'submissions', 'users'];

describe('migrations', () => {
  it('builds the full schema on an empty database without drift', async () => {
    const ds = await source(false).initialize();
    try {
      await ds.runMigrations();
      for (const name of tables) expect(await ds.createQueryRunner().hasTable(name)).toBe(true);
      const sql = await ds.driver.createSchemaBuilder().log();
      expect(sql.upQueries).toEqual([]);
    } finally {
      await ds.destroy();
    }
  });

  it('keeps data in a database created by the old synchronize', async () => {
    const ds = await source(true).initialize();
    try {
      await ds.query(`INSERT INTO users VALUES ('u1', 'a@b.c', 'hash', 'admin', 'now')`);
      await ds.runMigrations();
      expect(await ds.query('SELECT id FROM users')).toEqual([{ id: 'u1' }]);
      expect((await ds.query('SELECT name FROM migrations')).length).toBe(migrations.length);
    } finally {
      await ds.destroy();
    }
  });
});
