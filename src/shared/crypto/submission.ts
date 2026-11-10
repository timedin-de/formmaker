import { dict } from '../helper';
import {
  encryptedElementIds,
  type EncryptedValues,
  type EncryptionPublicKey,
  type FormDefinition,
} from '../model';
import type { Submission, SubmissionCreate } from '../model/submission.model';
import type { FieldValue } from '../model/values.model';
import { submissionValuesSchema } from '../schemas/submission';
import { fromBase64Url, toBase64Url, utf8 } from './base64url';
import { importPublicKey, randomBytes, subtle, toPublicKey, type UnlockedKey } from './keys';

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const;

/** Thrown when a form encrypts submissions but its owner has no key yet. */
export class EncryptionUnavailableError extends Error {
  constructor() {
    super('the form owner has no encryption key');
    this.name = 'EncryptionUnavailableError';
  }
}

/** Thrown when encrypted answers cannot be opened with the given key. */
export class DecryptionError extends Error {
  constructor(message = 'cannot decrypt submission') {
    super(message);
    this.name = 'DecryptionError';
  }
}

/** Encrypts `values` for the holder of `publicKey`, bound to the form `formId`. */
export async function encryptValues(
  values: Record<string, FieldValue>,
  recipient: { keyId: string; publicKey: EncryptionPublicKey },
  formId: string,
): Promise<EncryptedValues> {
  const ephemeral = await subtle().generateKey(CURVE, true, ['deriveBits']);
  const epk = toPublicKey(await subtle().exportKey('jwk', ephemeral.publicKey));
  const key = await contentKey(
    ephemeral.privateKey,
    await importPublicKey(recipient.publicKey),
    epk,
    recipient.keyId,
    'encrypt',
  );
  const iv = randomBytes(12);
  const data = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: submissionAad(formId) },
    key,
    utf8(JSON.stringify(values)),
  );
  return {
    v: 1,
    keyId: recipient.keyId,
    epk,
    iv: toBase64Url(iv),
    data: toBase64Url(new Uint8Array(data)),
  };
}

/** Decrypts answers encrypted by `encryptValues`; throws `DecryptionError` if that fails. */
export async function decryptValues(
  encrypted: EncryptedValues,
  key: UnlockedKey,
  formId: string,
): Promise<Record<string, FieldValue>> {
  if (encrypted.keyId !== key.keyId) throw new DecryptionError('encrypted for another key');
  let plain: ArrayBuffer;
  try {
    const aesKey = await contentKey(
      key.privateKey,
      await importPublicKey(encrypted.epk),
      encrypted.epk,
      encrypted.keyId,
      'decrypt',
    );
    plain = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(encrypted.iv), additionalData: submissionAad(formId) },
      aesKey,
      fromBase64Url(encrypted.data),
    );
  } catch {
    throw new DecryptionError();
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new DecryptionError('encrypted answers are malformed');
  }
  const parsed = submissionValuesSchema.safeParse(json);
  if (!parsed.success) throw new DecryptionError('encrypted answers are malformed');
  const values = dict<FieldValue>();
  for (const [id, value] of Object.entries(parsed.data)) values[id] = value;
  return values;
}

/**
 * Moves the answers the form encrypts out of `values` into `encrypted`. Forms
 * without encryption return the submission unchanged.
 */
export async function sealSubmission(
  form: Pick<FormDefinition, 'id' | 'settings' | 'elements'>,
  submission: SubmissionCreate,
): Promise<SubmissionCreate> {
  const encryption = form.settings.encryption;
  if (!encryption) return submission;
  const { keyId, publicKey } = encryption;
  if (!keyId || !publicKey) throw new EncryptionUnavailableError();

  const ids = encryptedElementIds(form);
  const plain = dict<FieldValue>();
  const secret = dict<FieldValue>();
  for (const [id, value] of Object.entries(submission.values)) {
    (ids.has(id) ? secret : plain)[id] = value;
  }
  return {
    ...submission,
    values: plain,
    encrypted: await encryptValues(secret, { keyId, publicKey }, form.id),
  };
}

/** The submission with its encrypted answers decrypted and merged into `values`. */
export async function openSubmission(
  submission: Submission,
  key: UnlockedKey,
): Promise<Submission> {
  const { encrypted, ...rest } = submission;
  if (!encrypted) return submission;
  const secret = await decryptValues(encrypted, key, submission.formId);
  return { ...rest, values: { ...submission.values, ...secret } };
}

/** AES-GCM key from ECDH(own private, peer public) through HKDF, bound to both keys. */
async function contentKey(
  privateKey: CryptoKey,
  peer: CryptoKey,
  epk: EncryptionPublicKey,
  keyId: string,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  const shared = await subtle().deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
  const ikm = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: utf8(`formmaker/submission/v1|${epk.x}|${epk.y}|${keyId}`),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

function submissionAad(formId: string): Uint8Array<ArrayBuffer> {
  return utf8(`formmaker/submission/v1|${formId}`);
}
