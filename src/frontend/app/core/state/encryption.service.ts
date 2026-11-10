import { Injectable, effect, inject, signal } from '@angular/core';
import {
  cryptoAvailable,
  generateEncryptionKey,
  rewrapEncryptionKey,
  unlockEncryptionKey,
  type UnlockedKey,
} from '@shared/crypto';
import type { UserEncryptionKey } from '@shared/model/encryption.model';
import { type SaveEncryptionKeyRequest, userEncryptionKeySchema } from '@shared/schemas';
import { AuthService } from '../auth/auth.service';
import { ApiClient } from './api-client';
import { ApiError } from './api-error';

const KEY_PATH = '/api/users/me/encryption-key';

/** Minimum passphrase length for the private key; it guards against offline guessing. */
export const MIN_PASSPHRASE_LENGTH = 12;

/**
 * The signed-in user's submission encryption key. The unlocked private key
 * lives only in memory (it is gone after a reload) and is non-extractable.
 */
@Injectable({ providedIn: 'root' })
export class EncryptionService {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);

  /** The stored key; `undefined` until loaded, `null` when the user has none. */
  readonly key = signal<UserEncryptionKey | null | undefined>(undefined);
  readonly unlocked = signal<UnlockedKey | null>(null);
  /** WebCrypto is only offered in secure contexts (HTTPS or localhost). */
  readonly available = cryptoAvailable();

  constructor() {
    // Forget the key, unlocked or not, as soon as the session ends.
    effect(() => {
      if (this.auth.authenticated()) return;
      this.key.set(undefined);
      this.unlocked.set(null);
    });
  }

  async load(): Promise<UserEncryptionKey | null> {
    try {
      const key = await this.api.request(userEncryptionKeySchema, KEY_PATH);
      this.key.set(key);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
      this.key.set(null);
    }
    const key = this.key() ?? null;
    if (this.unlocked()?.keyId !== key?.keyId) this.unlocked.set(null);
    return key;
  }

  /** Creates a key pair; `replace` swaps out an existing key for good. */
  async create(passphrase: string, replace = false): Promise<UserEncryptionKey> {
    const { key, unlocked } = await generateEncryptionKey(passphrase);
    await this.save({ ...key, ...(replace ? { replace: true } : {}) });
    this.unlocked.set(unlocked);
    return key;
  }

  /** Wraps the existing private key with a new passphrase. */
  async changePassphrase(passphrase: string, newPassphrase: string): Promise<void> {
    const key = this.key() ?? (await this.load());
    if (!key) throw new Error('no encryption key');
    await this.save(await rewrapEncryptionKey(key, passphrase, newPassphrase));
  }

  /** Unlocks the private key; throws `KeyUnlockError` for a wrong passphrase. */
  async unlock(passphrase: string): Promise<UnlockedKey | null> {
    const key = this.key() ?? (await this.load());
    if (!key) return null;
    const unlocked = await unlockEncryptionKey(key, passphrase);
    this.unlocked.set(unlocked);
    return unlocked;
  }

  lock(): void {
    this.unlocked.set(null);
  }

  private async save(body: SaveEncryptionKeyRequest): Promise<void> {
    const stored = await this.api.request(userEncryptionKeySchema, KEY_PATH, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    this.key.set(stored);
  }
}
