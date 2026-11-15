import { ConflictException } from '@nestjs/common';
import { createPage, FORM_SCHEMA_VERSION, type FormDefinition } from '@shared/model';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FormEntity, SubmissionEntity } from './entities/form.js';
import { SessionEntity, UserEntity } from './entities/user.js';
import { migrations } from './migrations/index.js';
import { Repository } from './repository.js';

const form: FormDefinition = {
  id: 'f1',
  name: 'Form',
  version: 1,
  schemaVersion: FORM_SCHEMA_VERSION,
  createdAt: '',
  updatedAt: '',
  settings: { navigation: 'auto' },
  pages: [createPage('Page')],
  elements: {},
};

describe('Repository.saveForm with a revision', () => {
  let ds: DataSource;
  let repository: Repository;

  beforeEach(async () => {
    ds = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [UserEntity, SessionEntity, FormEntity, SubmissionEntity],
      migrations,
    }).initialize();
    await ds.runMigrations();
    await ds.query(`INSERT INTO users VALUES ('u1', 'a@b.c', 'hash', 'admin', 'now')`);
    repository = new Repository(ds);
    await repository.saveForm('u1', form);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('saves while the form is unchanged and advances the revision', async () => {
    const loaded = await repository.form('f1');
    await repository.saveForm('u1', { ...loaded!.form, name: 'Renamed' }, loaded!.revision);

    const after = await repository.form('f1');
    expect(after?.form.name).toBe('Renamed');
    expect(after?.revision).not.toBe(loaded!.revision);
  });

  it('rejects a write based on a stale load with 409 and keeps the newer one', async () => {
    const first = await repository.form('f1');
    const second = await repository.form('f1');
    await repository.saveForm('u1', { ...first!.form, name: 'First' }, first!.revision);

    await expect(
      repository.saveForm('u1', { ...second!.form, name: 'Second' }, second!.revision),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await repository.form('f1'))?.form.name).toBe('First');
  });
});
