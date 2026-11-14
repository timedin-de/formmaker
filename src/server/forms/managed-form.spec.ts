import { BadRequestException, ConflictException } from '@nestjs/common';
import { createPage, FORM_SCHEMA_VERSION, type FormDefinition } from '@shared/model';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FormEntity, SubmissionEntity } from '../entities/form.js';
import { SessionEntity, UserEntity } from '../entities/user.js';
import { migrations } from '../migrations/index.js';
import { Repository, type User } from '../repository.js';
import type { OwnedForm } from './form.service.js';
import { changeManagedForm } from './managed-form.js';

const owner: User = {
  id: 'u1',
  email: 'a@b.c',
  passwordHash: 'hash',
  role: 'editor',
  createdAt: '',
};

const form: FormDefinition = {
  id: 'f1',
  name: 'Form',
  description: '',
  version: 1,
  schemaVersion: FORM_SCHEMA_VERSION,
  createdAt: '',
  updatedAt: '',
  settings: { navigation: 'auto' },
  pages: [createPage('Page')],
  elements: {},
};

describe('changeManagedForm', () => {
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
    await ds.query(`INSERT INTO users VALUES ('u1', 'a@b.c', 'hash', 'editor', 'now')`);
    repository = new Repository(ds);
    await repository.saveForm('u1', form);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  /** Saves `patch` into the stored form the way a competing request would. */
  async function saveMeanwhile(patch: Partial<FormDefinition>): Promise<void> {
    const current = await repository.form('f1');
    await repository.saveForm('u1', { ...current!.form, ...patch }, current!.revision);
  }

  const rename = (item: OwnedForm, name: string) =>
    repository.saveForm(item.ownerId, { ...item.form, name }, item.revision);

  it('applies the change again on top of a write that came in between', async () => {
    const loaded: string[] = [];

    await changeManagedForm(repository, 'f1', owner, async (item) => {
      loaded.push(item.form.description ?? '');
      if (loaded.length === 1) await saveMeanwhile({ description: 'Other' });
      await rename(item, 'Mine');
    });

    // The second run saw the other write, and the result keeps both changes.
    expect(loaded).toEqual(['', 'Other']);
    const stored = await repository.form('f1');
    expect(stored?.form).toMatchObject({ name: 'Mine', description: 'Other' });
  });

  it('gives up with 409 when every try loses the race', async () => {
    let runs = 0;

    const change = changeManagedForm(repository, 'f1', owner, async (item) => {
      runs++;
      await saveMeanwhile({ description: `Other ${runs}` });
      await rename(item, 'Mine');
    });

    await expect(change).rejects.toBeInstanceOf(ConflictException);
    expect(runs).toBe(3);
    expect((await repository.form('f1'))?.form.name).toBe('Form');
  });

  it('does not run the change again after any other error', async () => {
    let runs = 0;

    const change = changeManagedForm(repository, 'f1', owner, async () => {
      runs++;
      throw new BadRequestException({ error: 'invalid' });
    });

    await expect(change).rejects.toBeInstanceOf(BadRequestException);
    expect(runs).toBe(1);
  });
});
