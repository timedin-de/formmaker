import { Component, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  type FormGroupDirective,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { fingerprint, KeyUnlockError } from '@shared/crypto';
import { PasswordField } from '../core/components';
import { I18nService } from '../core/i18n';
import { Notifier } from '../core/notifier';
import { apiErrorMessage } from '../core/state/api-error';
import { EncryptionService, MIN_PASSPHRASE_LENGTH } from '../core/state/encryption.service';
import { fieldMatchValidator } from '../core/validators';

/** Account card to create, re-protect or replace the submission encryption key. */
@Component({
  imports: [MatButtonModule, MatCardModule, MatIconModule, PasswordField, ReactiveFormsModule],
  selector: 'fm-encryption-key-card',
  templateUrl: './encryption-key-card.html',
  // Shares the card styles of the account page it is part of.
  styleUrl: './account.scss',
})
export class EncryptionKeyCard {
  protected readonly encryption = inject(EncryptionService);
  protected readonly i18n = inject(I18nService);
  private readonly notifier = inject(Notifier);
  private readonly fb = inject(FormBuilder);

  protected readonly MIN = MIN_PASSPHRASE_LENGTH;
  protected readonly busy = signal(false);
  /** `replace` shows the new-key form for a user who already has a key. */
  protected readonly mode = signal<'view' | 'change' | 'replace'>('view');
  protected readonly fingerprint = computed(() => {
    const key = this.encryption.key();
    return key ? fingerprint(key.keyId) : '';
  });

  private readonly passphraseRules = [
    Validators.required,
    Validators.minLength(MIN_PASSPHRASE_LENGTH),
  ];

  readonly createForm = this.fb.nonNullable.group(
    { passphrase: ['', this.passphraseRules], confirm: ['', this.passphraseRules] },
    { validators: [fieldMatchValidator('passphrase', 'confirm')] },
  );

  readonly changeForm = this.fb.nonNullable.group(
    {
      current: ['', [Validators.required]],
      passphrase: ['', this.passphraseRules],
      confirm: ['', this.passphraseRules],
    },
    { validators: [fieldMatchValidator('passphrase', 'confirm')] },
  );

  constructor() {
    if (this.encryption.available) {
      this.encryption.load().catch((error: unknown) => this.fail(error));
    }
  }

  async create(formDir: FormGroupDirective): Promise<void> {
    const { passphrase } = this.createForm.getRawValue();
    if (this.createForm.invalid || !passphrase) return;
    const replace = this.mode() === 'replace';
    await this.run(async () => {
      await this.encryption.create(passphrase, replace);
      formDir.resetForm();
      this.mode.set('view');
      this.notifier.ok(replace ? 'account.encryption.replaced' : 'account.encryption.created');
    });
  }

  async change(formDir: FormGroupDirective): Promise<void> {
    const { current, passphrase } = this.changeForm.getRawValue();
    if (this.changeForm.invalid || !current || !passphrase) return;
    await this.run(async () => {
      await this.encryption.changePassphrase(current, passphrase);
      formDir.resetForm();
      this.mode.set('view');
      this.notifier.ok('account.encryption.passphraseChanged');
    });
  }

  cancel(): void {
    this.createForm.reset();
    this.changeForm.reset();
    this.mode.set('view');
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(error: unknown): void {
    if (error instanceof KeyUnlockError) this.notifier.error('account.encryption.wrongPassphrase');
    else this.notifier.errorText(apiErrorMessage(error));
  }
}
