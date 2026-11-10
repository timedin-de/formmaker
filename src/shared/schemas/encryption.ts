import * as z from 'zod/mini';
import {
  ENCRYPTION_MODES,
  type EncryptedValues,
  type EncryptionPublicKey,
  type FormEncryption,
  type UserEncryptionKey,
  type WrappedPrivateKey,
} from '../model';

/** PBKDF2 iterations a stored private key must at least be wrapped with. */
export const MIN_KEY_WRAP_ITERATIONS = 100_000;

const base64url = (min: number, max: number) =>
  z.string().check(z.minLength(min), z.maxLength(max), z.regex(/^[A-Za-z0-9_-]*$/));

/** A P-256 coordinate: 32 bytes, 43 base64url characters. */
const coordinate = base64url(43, 43);
/** A 12 byte AES-GCM nonce. */
const iv = base64url(16, 16);
/** RFC 7638 SHA-256 thumbprint. */
export const keyIdSchema = base64url(43, 43);

export const encryptionPublicKeySchema = z.strictObject({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: coordinate,
  y: coordinate,
}) satisfies z.ZodMiniType<EncryptionPublicKey>;

export const formEncryptionSchema = z.strictObject({
  mode: z.enum(ENCRYPTION_MODES),
  keyId: z.optional(keyIdSchema),
  publicKey: z.optional(encryptionPublicKeySchema),
}) satisfies z.ZodMiniType<FormEncryption>;

export const wrappedPrivateKeySchema = z.strictObject({
  kdf: z.literal('PBKDF2-SHA256'),
  iterations: z.number().check(z.int(), z.minimum(MIN_KEY_WRAP_ITERATIONS), z.maximum(10_000_000)),
  salt: base64url(16, 64),
  iv,
  data: base64url(1, 1024),
}) satisfies z.ZodMiniType<WrappedPrivateKey>;

export const userEncryptionKeySchema = z.strictObject({
  keyId: keyIdSchema,
  publicKey: encryptionPublicKeySchema,
  wrappedPrivateKey: wrappedPrivateKeySchema,
}) satisfies z.ZodMiniType<UserEncryptionKey>;

/** Body of `PUT /api/users/me/encryption-key`. */
export const saveEncryptionKeySchema = z.strictObject({
  ...userEncryptionKeySchema.shape,
  /** Required to replace an existing key by a different one. */
  replace: z.optional(z.boolean()),
});

export type SaveEncryptionKeyRequest = z.infer<typeof saveEncryptionKeySchema>;

export const encryptedValuesSchema = z.strictObject({
  v: z.literal(1),
  keyId: keyIdSchema,
  epk: encryptionPublicKeySchema,
  iv,
  // Bounded by the JSON body limit; the ciphertext holds at least the tag.
  data: z.string().check(z.minLength(22), z.regex(/^[A-Za-z0-9_-]*$/)),
}) satisfies z.ZodMiniType<EncryptedValues>;
