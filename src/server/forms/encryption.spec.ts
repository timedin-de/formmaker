import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  generateEncryptionKey,
  openSubmission,
  sealSubmission,
  unlockEncryptionKey,
} from '@shared/crypto';
import {
  FORM_SCHEMA_VERSION,
  type FormDefinition,
  type FormEncryption,
  type Submission,
  type SubmissionCreate,
  type TextElement,
  type UserEncryptionKey,
} from '@shared/model';
import { MIN_KEY_WRAP_ITERATIONS } from '@shared/schemas';
import { documentFromTree } from '@test/helper/forms';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';

const PASSPHRASE = 'correct horse battery';

function text(id: string, extra: Partial<TextElement> = {}): TextElement {
  return {
    id,
    type: 'text',
    label: id,
    description: undefined,
    width: 1,
    required: false,
    validations: [],
    readonly: false,
    defaultValue: null,
    placeholder: '',
    ...extra,
  };
}

function formWith(encryption: FormEncryption, elements: TextElement[]): FormDefinition {
  return {
    id: 'ignored',
    name: 'Encrypted',
    version: 1,
    schemaVersion: FORM_SCHEMA_VERSION,
    settings: { navigation: 'auto', encryption },
    ...documentFromTree([{ id: 'p1', title: 'P', subtitle: '', elements }]),
    createdAt: '',
    updatedAt: '',
  };
}

describe('encrypted submissions API', () => {
  let app: NestExpressApplication;
  let base: string;
  let token: string;
  let key: UserEncryptionKey;

  const call = async (method: string, path: string, body?: unknown): Promise<Response> =>
    fetch(`${base}/api/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const importForm = async (form: FormDefinition): Promise<FormDefinition> => {
    const res = await call('POST', 'forms/import', form);
    expect(res.status).toBe(201);
    return (await res.json()) as FormDefinition;
  };

  const submit = (form: FormDefinition, submission: SubmissionCreate) =>
    call('POST', `forms/${form.id}/submissions`, submission);

  beforeAll(async () => {
    process.env.SQLITE_PATH = ':memory:';
    vi.stubEnv('FORMMAKER_PASSWORD', 'formmaker');
    app = await createApp();
    await app.listen(0);
    base = await app.getUrl();
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@formmaker.local', password: 'formmaker' }),
    });
    token = ((await login.json()) as { token: string }).token;
    key = (await generateEncryptionKey(PASSPHRASE, MIN_KEY_WRAP_ITERATIONS)).key;
  });
  afterAll(async () => {
    await app.close();
  });

  describe('key storage', () => {
    it('has no key at first', async () => {
      expect((await call('GET', 'users/me/encryption-key')).status).toBe(404);
    });

    it('rejects a key whose id does not match its public key', async () => {
      const other = (await generateEncryptionKey(PASSPHRASE, MIN_KEY_WRAP_ITERATIONS)).key;
      const res = await call('PUT', 'users/me/encryption-key', { ...key, keyId: other.keyId });
      expect(res.status).toBe(400);
    });

    it('rejects a weakly wrapped private key', async () => {
      const weak = (await generateEncryptionKey(PASSPHRASE, 1000)).key;
      expect((await call('PUT', 'users/me/encryption-key', weak)).status).toBe(422);
    });

    it('stores the key and returns it', async () => {
      expect((await call('PUT', 'users/me/encryption-key', key)).status).toBe(200);
      const res = await call('GET', 'users/me/encryption-key');
      expect(await res.json()).toEqual(key);
    });

    it('needs replace to swap in a different key', async () => {
      const other = (await generateEncryptionKey(PASSPHRASE, MIN_KEY_WRAP_ITERATIONS)).key;
      const res = await call('PUT', 'users/me/encryption-key', other);
      expect(res.status).toBe(409);
    });
  });

  describe('selected fields', () => {
    let form: FormDefinition;

    beforeAll(async () => {
      form = await importForm(
        formWith({ mode: 'fields' }, [
          text('plain', { required: true }),
          text('secret', { required: true, encrypted: true }),
          // Visible only when the encrypted answer is given: the server cannot tell.
          text('followUp', {
            required: true,
            enabledWhen: {
              logic: 'all',
              conditions: [{ fieldId: 'secret', operator: 'isNotEmpty' }],
              groups: [],
            },
          }),
        ]),
      );
    });

    it("stamps the owner's public key into the form", () => {
      expect(form.settings.encryption).toEqual({
        mode: 'fields',
        keyId: key.keyId,
        publicKey: key.publicKey,
      });
    });

    it('stores only the encrypted answers out of reach of the server', async () => {
      const sealed = await sealSubmission(form, {
        formId: form.id,
        durationMs: 1,
        values: { plain: 'visible', secret: 'hidden', followUp: 'later' },
      });
      expect(sealed.values).toEqual({ plain: 'visible', followUp: 'later' });
      expect((await submit(form, sealed)).status).toBe(201);

      const subs = (await (
        await call('GET', `forms/${form.id}/submissions`)
      ).json()) as Submission[];
      expect(subs).toHaveLength(1);
      expect(JSON.stringify(subs[0])).not.toContain('hidden');
      const unlocked = await unlockEncryptionKey(key, PASSPHRASE);
      const opened = await openSubmission(subs[0], unlocked);
      expect(opened.values).toEqual({ plain: 'visible', secret: 'hidden', followUp: 'later' });
    });

    it('still validates the plain answers', async () => {
      const sealed = await sealSubmission(form, { formId: form.id, durationMs: 1, values: {} });
      expect((await submit(form, sealed)).status).toBe(400);
    });

    it('accepts a missing answer whose visibility depends on an encrypted one', async () => {
      const sealed = await sealSubmission(form, {
        formId: form.id,
        durationMs: 1,
        values: { plain: 'visible' },
      });
      expect((await submit(form, sealed)).status).toBe(201);
    });

    it('rejects an encrypted field sent in plain text', async () => {
      const sealed = await sealSubmission(form, {
        formId: form.id,
        durationMs: 1,
        values: { plain: 'visible' },
      });
      const res = await submit(form, { ...sealed, values: { plain: 'visible', secret: 'leak' } });
      expect(res.status).toBe(400);
    });

    it('rejects a submission without encrypted part', async () => {
      const res = await submit(form, { formId: form.id, durationMs: 1, values: { plain: 'x' } });
      expect(res.status).toBe(400);
    });
  });

  describe('whole form', () => {
    it('accepts only encrypted answers', async () => {
      const form = await importForm(formWith({ mode: 'form' }, [text('a', { required: true })]));
      const sealed = await sealSubmission(form, {
        formId: form.id,
        durationMs: 1,
        values: { a: 'anything' },
      });
      expect(sealed.values).toEqual({});
      expect((await submit(form, sealed)).status).toBe(201);
      expect((await submit(form, { ...sealed, values: { a: 'plain' } })).status).toBe(400);
    });
  });

  describe('key replacement', () => {
    it('restamps the forms and rejects answers for the old key', async () => {
      const form = await importForm(formWith({ mode: 'form' }, [text('a')]));
      const stale = await sealSubmission(form, { formId: form.id, durationMs: 1, values: {} });

      const next = (await generateEncryptionKey(PASSPHRASE, MIN_KEY_WRAP_ITERATIONS)).key;
      const res = await call('PUT', 'users/me/encryption-key', { ...next, replace: true });
      expect(res.status).toBe(200);

      const reloaded = (await (await call('GET', `forms/${form.id}`)).json()) as FormDefinition;
      expect(reloaded.settings.encryption?.keyId).toBe(next.keyId);
      expect((await submit(form, stale)).status).toBe(409);
      expect((await submit(reloaded, await sealSubmission(reloaded, stale))).status).toBe(201);
    });
  });

  it('rejects encrypted answers for a form without encryption', async () => {
    const plainForm = await importForm({
      ...formWith({ mode: 'form' }, [text('a')]),
      settings: { navigation: 'auto' },
    });
    const sealed = await sealSubmission(
      {
        ...plainForm,
        settings: {
          navigation: 'auto',
          encryption: { mode: 'form', keyId: key.keyId, publicKey: key.publicKey },
        },
      },
      { formId: plainForm.id, durationMs: 1, values: {} },
    );
    expect((await submit(plainForm, sealed)).status).toBe(400);
  });
});
