import type { ElementDefinition, FormDefinition, SaveFormDefinition } from './form.model';
import type { ElementId } from './ids';

/**
 * End-to-end encryption of submissions.
 *
 * Every user may own one key pair (ECDH P-256). The public key is stamped into
 * the user's forms by the server; respondents encrypt answers with it in the
 * browser. The private key never leaves the browser in plain form: it is
 * stored on the server wrapped with a passphrase only the owner knows, and
 * unwrapped in the results page to decrypt submissions.
 */

/** `form`: every answer is encrypted. `fields`: only questions marked `encrypted`. */
export const ENCRYPTION_MODES = ['form', 'fields'] as const;
export type EncryptionMode = (typeof ENCRYPTION_MODES)[number];

/** Public part of a P-256 key as JWK (only the members needed to import it). */
export interface EncryptionPublicKey {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

export interface FormEncryption {
  mode: EncryptionMode;
  /** JWK thumbprint (RFC 7638) of `publicKey`; set by the server from the owner's key. */
  keyId?: string;
  /** The owner's public key; absent while the owner has no key. */
  publicKey?: EncryptionPublicKey;
}

/** A PKCS#8 private key encrypted with AES-GCM under a PBKDF2-derived key. */
export interface WrappedPrivateKey {
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  /** base64url */
  salt: string;
  /** base64url, 12 bytes */
  iv: string;
  /** base64url ciphertext + tag */
  data: string;
}

/** A user's key pair as stored on the server. */
export interface UserEncryptionKey {
  keyId: string;
  publicKey: EncryptionPublicKey;
  wrappedPrivateKey: WrappedPrivateKey;
}

/** Encrypted answers of a submission (ECIES: ECDH P-256 + HKDF-SHA256 + AES-256-GCM). */
export interface EncryptedValues {
  v: 1;
  keyId: string;
  /** Ephemeral public key of the sender. */
  epk: EncryptionPublicKey;
  /** base64url, 12 bytes */
  iv: string;
  /** base64url ciphertext + tag of the JSON encoded `Record<ElementId, FieldValue>`. */
  data: string;
}

type EncryptableForm = Pick<FormDefinition, 'settings' | 'elements'>;

/** Whether answers to `element` are encrypted in `form`. */
export function isEncryptedElement(form: EncryptableForm, element: ElementDefinition): boolean {
  const mode = form.settings.encryption?.mode;
  if (!mode || !('validations' in element)) return false;
  return mode === 'form' || element.encrypted === true;
}

/** Ids of every question whose answer is encrypted in `form`. */
export function encryptedElementIds(form: EncryptableForm): Set<ElementId> {
  const ids = new Set<ElementId>();
  for (const element of Object.values(form.elements)) {
    if (isEncryptedElement(form, element)) ids.add(element.id);
  }
  return ids;
}

/**
 * The form with the owner's current key in its encryption settings, or without
 * one when the owner has none. Forms without encryption are returned as is.
 */
export function withEncryptionKey<T extends SaveFormDefinition>(
  form: T,
  key: Pick<UserEncryptionKey, 'keyId' | 'publicKey'> | null,
): T {
  const encryption = form.settings.encryption;
  if (!encryption) return form;
  const next: FormEncryption = { mode: encryption.mode };
  if (key) {
    next.keyId = key.keyId;
    next.publicKey = key.publicKey;
  }
  return { ...form, settings: { ...form.settings, encryption: next } };
}
