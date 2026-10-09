import { formDefinitionSchema } from '@shared/schemas';
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

  it('moves legacy maxLength and number min/max properties into validation rules', async () => {
    const legacy = {
      id: 'f1',
      name: 'Legacy',
      version: 1,
      schemaVersion: 1,
      settings: { navigation: 'auto' },
      pages: [
        {
          id: 'p1',
          title: 'Page',
          elements: [
            { id: 'default', type: 'text', label: 'Default', inputType: 'text', maxLength: 255 },
            {
              id: 'ruled',
              type: 'longText',
              label: 'Ruled',
              maxLength: 1000,
              validations: [
                { id: 'v1', rule: 'maxLength', value: 500, message: 'This value is invalid' },
              ],
            },
            {
              id: 'group',
              type: 'group',
              label: 'Group',
              elements: [{ id: 'custom', type: 'text', label: 'Custom', maxLength: 20 }],
            },
            { id: 'range', type: 'number', label: 'Range', min: 0, max: 10 },
            {
              id: 'ruledMax',
              type: 'number',
              label: 'Ruled max',
              max: 99,
              validations: [{ id: 'v2', rule: 'max', value: 50 }],
            },
            { id: 'scale', type: 'scale', label: 'Scale', min: 1, max: 5, step: 1 },
          ],
        },
      ],
    };
    const ds = await source(true).initialize();
    try {
      await ds.query(`INSERT INTO users VALUES ('u1', 'a@b.c', 'hash', 'admin', 'now')`);
      await ds.query(`INSERT INTO forms VALUES ('f1', 'u1', ?, 'now', 'now')`, [
        JSON.stringify(legacy),
      ]);
      await ds.runMigrations();

      const [row] = await ds.query(`SELECT document FROM forms WHERE id = 'f1'`);
      const form = formDefinitionSchema.parse(JSON.parse(row.document));
      const [plain, ruled, group, range, ruledMax, scale] = form.pages[0].elements;
      expect(plain.type === 'text' && plain.validations).toEqual([]);
      expect(ruled.type === 'longText' && ruled.validations).toEqual([
        { id: 'v1', rule: 'maxLength', value: 500, message: 'This value is invalid' },
      ]);
      const custom = group.type === 'group' ? group.elements[0] : undefined;
      expect(custom?.type === 'text' && custom.validations).toEqual([
        { id: expect.any(String), rule: 'maxLength', value: 20, message: 'This value is invalid' },
      ]);
      expect(range.type === 'number' && range.validations).toEqual([
        { id: expect.any(String), rule: 'min', value: 0, message: 'This value is invalid' },
        { id: expect.any(String), rule: 'max', value: 10, message: 'This value is invalid' },
      ]);
      expect(ruledMax.type === 'number' && ruledMax.validations).toEqual([
        { id: 'v2', rule: 'max', value: 50, message: 'This value is invalid' },
      ]);
      expect(scale).toMatchObject({ min: 1, max: 5, validations: [] });
    } finally {
      await ds.destroy();
    }
  });
});
