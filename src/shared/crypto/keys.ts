import type {
  EncryptionPublicKey,
  UserEncryptionKey,
  WrappedPrivateKey,
} from '../model/encryption.model';
import { fromBase64Url, toBase64Url, utf8 } from './base64url';

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const;

/** OWASP 2023 recommendation for PBKDF2-HMAC-SHA256. */
export const DEFAULT_KEY_WRAP_ITERATIONS = 600_000;

/** A private key unlocked in memory, ready to decrypt submissions. */
export interface UnlockedKey {
  keyId: string;
  privateKey: CryptoKey;
}

/** Thrown when a wrapped key cannot be opened, e.g. because the passphrase is wrong. */
export class KeyUnlockError extends Error {
  constructor() {
    super('wrong passphrase or damaged key');
    this.name = 'KeyUnlockError';
  }
}

/** WebCrypto, which browsers only offer in secure contexts (HTTPS or localhost). */
export function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error('WebCrypto is unavailable (requires HTTPS)');
  return api;
}

export function cryptoAvailable(): boolean {
  return !!globalThis.crypto?.subtle;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export function toPublicKey(jwk: JsonWebKey): EncryptionPublicKey {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new Error('not a P-256 public key');
  }
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}

/** RFC 7638 JWK thumbprint (SHA-256, base64url): the id of a key pair. */
export async function keyIdOf(key: EncryptionPublicKey): Promise<string> {
  // Members in lexicographic order, no whitespace, as the RFC requires.
  const canonical = JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x, y: key.y });
  return toBase64Url(new Uint8Array(await subtle().digest('SHA-256', utf8(canonical))));
}

/** Short, readable form of a key id for display, e.g. `Ab3x-9KqP-…`. */
export function fingerprint(keyId: string): string {
  return (keyId.slice(0, 16).match(/.{1,4}/g) ?? []).join('-');
}

export function importPublicKey(key: EncryptionPublicKey): Promise<CryptoKey> {
  return subtle().importKey('jwk', { ...key, ext: true }, CURVE, true, []);
}

export interface GeneratedKey {
  key: UserEncryptionKey;
  unlocked: UnlockedKey;
}

/** Creates a key pair and wraps its private key with `passphrase`. */
export async function generateEncryptionKey(
  passphrase: string,
  iterations = DEFAULT_KEY_WRAP_ITERATIONS,
): Promise<GeneratedKey> {
  const pair = await subtle().generateKey(CURVE, true, ['deriveBits']);
  const publicKey = toPublicKey(await subtle().exportKey('jwk', pair.publicKey));
  const keyId = await keyIdOf(publicKey);
  const wrappedPrivateKey = await wrapPrivateKey(pair.privateKey, keyId, passphrase, iterations);
  return {
    key: { keyId, publicKey, wrappedPrivateKey },
    unlocked: { keyId, privateKey: pair.privateKey },
  };
}

/** Wraps the stored private key again with a new passphrase; the key pair stays the same. */
export async function rewrapEncryptionKey(
  key: UserEncryptionKey,
  passphrase: string,
  newPassphrase: string,
  iterations = DEFAULT_KEY_WRAP_ITERATIONS,
): Promise<UserEncryptionKey> {
  const privateKey = await unwrapPkcs8(key, passphrase, true);
  return {
    ...key,
    wrappedPrivateKey: await wrapPrivateKey(privateKey, key.keyId, newPassphrase, iterations),
  };
}

/** Opens the private key of `key` with `passphrase`; throws `KeyUnlockError` if that fails. */
export async function unlockEncryptionKey(
  key: UserEncryptionKey,
  passphrase: string,
): Promise<UnlockedKey> {
  return { keyId: key.keyId, privateKey: await unwrapPkcs8(key, passphrase, false) };
}

async function wrapPrivateKey(
  privateKey: CryptoKey,
  keyId: string,
  passphrase: string,
  iterations: number,
): Promise<WrappedPrivateKey> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kek = await passphraseKey(passphrase, salt, iterations);
  const pkcs8 = await subtle().exportKey('pkcs8', privateKey);
  const data = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: wrapAad(keyId) },
    kek,
    pkcs8,
  );
  return {
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    data: toBase64Url(new Uint8Array(data)),
  };
}

async function unwrapPkcs8(
  key: UserEncryptionKey,
  passphrase: string,
  extractable: boolean,
): Promise<CryptoKey> {
  const wrapped = key.wrappedPrivateKey;
  let pkcs8: ArrayBuffer;
  try {
    const kek = await passphraseKey(passphrase, fromBase64Url(wrapped.salt), wrapped.iterations);
    pkcs8 = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(wrapped.iv), additionalData: wrapAad(key.keyId) },
      kek,
      fromBase64Url(wrapped.data),
    );
  } catch {
    throw new KeyUnlockError();
  }
  // The private JWK carries the public point: check it belongs to the stored public key.
  const check = await subtle().importKey('pkcs8', pkcs8, CURVE, true, ['deriveBits']);
  const jwk = await subtle().exportKey('jwk', check);
  if ((await keyIdOf(toPublicKey(jwk))) !== key.keyId) throw new KeyUnlockError();
  return extractable ? check : subtle().importKey('pkcs8', pkcs8, CURVE, false, ['deriveBits']);
}

async function passphraseKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', utf8(passphrase.normalize('NFC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function wrapAad(keyId: string): Uint8Array<ArrayBuffer> {
  return utf8(`formmaker/private-key/v1|${keyId}`);
}
