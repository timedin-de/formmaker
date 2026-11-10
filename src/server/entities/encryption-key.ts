import { EntitySchema } from 'typeorm';
import type { UserEntityModel } from './user';

/** A user's submission encryption key pair; the private key is passphrase-wrapped JSON. */
export interface EncryptionKeyEntityModel {
  userId: string;
  keyId: string;
  publicKey: string;
  wrappedPrivateKey: string;
  createdAt: string;
  updatedAt: string;
  user?: UserEntityModel;
}

export const EncryptionKeyEntity = new EntitySchema<EncryptionKeyEntityModel>({
  name: 'EncryptionKey',
  tableName: 'encryption_keys',
  columns: {
    userId: { name: 'user_id', type: String, primary: true },
    keyId: { name: 'key_id', type: String, length: 64 },
    publicKey: { name: 'public_key', type: 'text' },
    wrappedPrivateKey: { name: 'wrapped_private_key', type: 'text' },
    createdAt: { name: 'created_at', type: String },
    updatedAt: { name: 'updated_at', type: String },
  },
  relations: {
    user: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: { name: 'user_id' },
      onDelete: 'CASCADE',
    },
  },
});
