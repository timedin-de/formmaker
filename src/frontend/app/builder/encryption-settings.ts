import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { fingerprint } from '@shared/crypto';
import { encryptedElementIds, type EncryptionMode } from '@shared/model/encryption.model';
import { I18nService } from '../core/i18n';
import { type DesignerStore } from '../core/state/designer.store';

/** Chooses whether and which answers of the edited form are end-to-end encrypted. */
@Component({
  imports: [MatButtonModule, MatButtonToggleModule, MatIconModule, RouterLink],
  selector: 'fm-encryption-settings',
  templateUrl: './encryption-settings.html',
  styleUrl: './encryption-settings.scss',
})
export class EncryptionSettings {
  readonly store = input.required<DesignerStore>();
  /** Emitted after the mode changed, so the form can be saved and get the owner's key. */
  readonly changed = output<void>();
  protected readonly i18n = inject(I18nService);

  protected readonly encryption = computed(() => this.store().form().settings.encryption);
  protected readonly mode = computed(() => this.encryption()?.mode ?? 'off');
  protected readonly fingerprint = computed(() => {
    const keyId = this.encryption()?.keyId;
    return keyId ? fingerprint(keyId) : null;
  });
  protected readonly encryptedCount = computed(() => encryptedElementIds(this.store().form()).size);

  setMode(mode: EncryptionMode | 'off'): void {
    const current = this.encryption();
    this.store().updateSettings({
      encryption: mode === 'off' ? undefined : { ...current, mode },
    });
    this.changed.emit();
  }
}
