import { describe, expect, it } from 'vitest';
import type { FormDefinition, Submission, TextElement } from '../model';
import { fromBase64Url, toBase64Url } from './base64url';
import {
  fingerprint,
  generateEncryptionKey,
  KeyUnlockError,
  keyIdOf,
  rewrapEncryptionKey,
  unlockEncryptionKey,
} from './keys';
import {
  decryptValues,
  DecryptionError,
  encryptValues,
  EncryptionUnavailableError,
  openSubmission,
  sealSubmission,
} from './submission';

/** Low iteration count: these tests check the format, not the work factor. */
const FAST = 1000;
const PASS = 'a long passphrase';

function text(id: string, encrypted?: boolean): TextElement {
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
    ...(encrypted ? { encrypted } : {}),
  };
}

describe('base64url', () => {
  it('round-trips bytes without padding or url-unsafe characters', () => {
    const bytes = new Uint8Array([0, 251, 255, 62, 63, 1]);
    const encoded = toBase64Url(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect([...fromBase64Url(encoded)]).toEqual([...bytes]);
  });

  it('rejects malformed input', () => {
    expect(() => fromBase64Url('a+b/')).toThrow();
  });
});

describe('encryption keys', () => {
  it('derives the key id from the public key (RFC 7638 thumbprint)', async () => {
    const { key } = await generateEncryptionKey(PASS, FAST);
    expect(key.keyId).toBe(await keyIdOf(key.publicKey));
    expect(key.keyId).toHaveLength(43);
    expect(fingerprint(key.keyId)).toMatch(/^.{4}-.{4}-.{4}-.{4}$/);
  });

  it('unlocks only with the right passphrase', async () => {
    const { key } = await generateEncryptionKey(PASS, FAST);
    await expect(unlockEncryptionKey(key, PASS)).resolves.toMatchObject({ keyId: key.keyId });
    await expect(unlockEncryptionKey(key, 'wrong')).rejects.toBeInstanceOf(KeyUnlockError);
  });

  it('rejects a wrapped key that belongs to another public key', async () => {
    const a = (await generateEncryptionKey(PASS, FAST)).key;
    const b = (await generateEncryptionKey(PASS, FAST)).key;
    const swapped = { ...a, wrappedPrivateKey: b.wrappedPrivateKey };
    await expect(unlockEncryptionKey(swapped, PASS)).rejects.toBeInstanceOf(KeyUnlockError);
  });

  it('rewraps with a new passphrase and keeps the key pair', async () => {
    const { key } = await generateEncryptionKey(PASS, FAST);
    const rewrapped = await rewrapEncryptionKey(key, PASS, 'another passphrase', FAST);
    expect(rewrapped.keyId).toBe(key.keyId);
    await expect(unlockEncryptionKey(rewrapped, PASS)).rejects.toBeInstanceOf(KeyUnlockError);
    const unlocked = await unlockEncryptionKey(rewrapped, 'another passphrase');
    const sealed = await encryptValues({ a: 1 }, key, 'f1');
    await expect(decryptValues(sealed, unlocked, 'f1')).resolves.toEqual({ a: 1 });
  });
});

describe('encrypted values', () => {
  it('round-trips every kind of answer', async () => {
    const { key, unlocked } = await generateEncryptionKey(PASS, FAST);
    const values = {
      t: 'Grüße ✓',
      n: 4.5,
      b: false,
      m: ['x', 'y'],
      s: { dataUrl: 'data:image/png;base64,AA', width: 1, height: 1, mimeType: 'image/png' },
      z: null,
    } as const;
    const sealed = await encryptValues({ ...values, m: [...values.m] }, key, 'f1');
    expect(JSON.stringify(sealed)).not.toContain('Grüße');
    await expect(decryptValues(sealed, unlocked, 'f1')).resolves.toEqual(values);
  });

  it('cannot be moved to another form', async () => {
    const { key, unlocked } = await generateEncryptionKey(PASS, FAST);
    const sealed = await encryptValues({ a: 'x' }, key, 'f1');
    await expect(decryptValues(sealed, unlocked, 'f2')).rejects.toBeInstanceOf(DecryptionError);
  });

  it('detects tampering', async () => {
    const { key, unlocked } = await generateEncryptionKey(PASS, FAST);
    const sealed = await encryptValues({ a: 'x' }, key, 'f1');
    const bytes = fromBase64Url(sealed.data);
    bytes[0] ^= 1;
    const tampered = { ...sealed, data: toBase64Url(bytes) };
    await expect(decryptValues(tampered, unlocked, 'f1')).rejects.toBeInstanceOf(DecryptionError);
  });

  it('needs the matching key', async () => {
    const a = await generateEncryptionKey(PASS, FAST);
    const b = await generateEncryptionKey(PASS, FAST);
    const sealed = await encryptValues({ a: 'x' }, a.key, 'f1');
    await expect(decryptValues(sealed, b.unlocked, 'f1')).rejects.toBeInstanceOf(DecryptionError);
    // Even with a forged key id, the ECDH secret does not match.
    const forged = { ...sealed, keyId: b.key.keyId };
    await expect(decryptValues(forged, b.unlocked, 'f1')).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe('sealing submissions', () => {
  const form = (mode?: 'form' | 'fields', withKey?: { keyId: string; publicKey: never }) =>
    ({
      id: 'f1',
      settings: { navigation: 'auto', ...(mode ? { encryption: { mode, ...withKey } } : {}) },
      elements: { a: text('a'), b: text('b', true) },
    }) as unknown as FormDefinition;

  const create = { formId: 'f1', durationMs: 5, values: { a: 'plain', b: 'secret' } };

  it('leaves submissions of plain forms untouched', async () => {
    await expect(sealSubmission(form(), create)).resolves.toBe(create);
  });

  it('refuses to send answers when the owner has no key', async () => {
    await expect(sealSubmission(form('form'), create)).rejects.toBeInstanceOf(
      EncryptionUnavailableError,
    );
  });

  it('encrypts only the marked questions, or every one for the whole form', async () => {
    const { key, unlocked } = await generateEncryptionKey(PASS, FAST);
    const k = { keyId: key.keyId, publicKey: key.publicKey as never };

    const fields = await sealSubmission(form('fields', k), create);
    expect(fields.values).toEqual({ a: 'plain' });

    const whole = await sealSubmission(form('form', k), create);
    expect(whole.values).toEqual({});

    const stored: Submission = {
      ...fields,
      id: 's1',
      formVersion: 1,
      submittedAt: new Date().toISOString(),
    };
    const opened = await openSubmission(stored, unlocked);
    expect(opened.values).toEqual(create.values);
    expect(opened.encrypted).toBeUndefined();
  });
});
