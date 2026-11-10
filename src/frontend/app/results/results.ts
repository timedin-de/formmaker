import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { KeyUnlockError, openSubmission } from '@shared/crypto';
import { formName } from '@shared/helper';
import type { FormDefinition } from '@shared/model/form.model';
import type { Submission } from '@shared/model/submission.model';
import {
  buildColumns,
  downloadBlob,
  EXPORT_CHANNELS,
  rowForSubmission,
  type ExportChannel,
} from '../core/export';
import { PasswordField } from '../core/components';
import { I18nService, type TranslationKey } from '../core/i18n';
import { Notifier } from '../core/notifier';
import { EncryptionService } from '../core/state/encryption.service';
import { FormsRepository } from '../core/state/forms.repository';

@Component({
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatToolbarModule,
    MatTooltipModule,
    PasswordField,
    ReactiveFormsModule,
  ],
  selector: 'fm-results',
  templateUrl: './results.html',
  styleUrl: './results.scss',
})
export class Results {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly repo = inject(FormsRepository);
  private readonly notifier = inject(Notifier);
  protected readonly i18n = inject(I18nService);

  protected readonly encryption = inject(EncryptionService);

  private readonly formId = signal<string | null>(null);
  protected readonly form = signal<FormDefinition | undefined>(undefined);
  /** Submissions as the server returns them; encrypted answers still sealed. */
  private readonly stored = signal<Submission[]>([]);
  /** Decrypted copies by submission id; they only ever exist in this browser's memory. */
  private readonly opened = signal<ReadonlyMap<string, Submission>>(new Map());
  protected readonly submissions = computed(() =>
    this.stored().map((sub) => this.opened().get(sub.id) ?? sub),
  );
  /** Submissions whose encrypted answers are not decrypted (yet). */
  protected readonly lockedCount = computed(
    () => this.submissions().filter((sub) => sub.encrypted).length,
  );
  protected readonly passphrase = new FormControl('', { nonNullable: true });
  protected readonly unlocking = signal(false);
  protected readonly unlockError = signal<TranslationKey | null>(null);
  protected readonly columns = computed(() =>
    this.form() ? buildColumns(this.form()!, this.i18n) : [],
  );
  protected readonly channels = EXPORT_CHANNELS;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.formId.set(id);
    if (id) void this.load(id);
  }

  private async load(id: string): Promise<void> {
    this.form.set(await this.repo.getForm(id));
    await this.reload(id);
  }

  private async reload(formId: string): Promise<void> {
    this.stored.set(await this.repo.submissionsFor(formId));
    // A key unlocked earlier in this session opens new submissions right away.
    await this.decryptAll();
  }

  async unlock(): Promise<void> {
    const passphrase = this.passphrase.value;
    if (!passphrase || this.unlocking()) return;
    this.unlocking.set(true);
    this.unlockError.set(null);
    try {
      if (!(await this.encryption.unlock(passphrase))) {
        this.unlockError.set('results.unlock.noKey');
        return;
      }
      this.passphrase.reset();
      await this.decryptAll();
    } catch (error) {
      this.unlockError.set(
        error instanceof KeyUnlockError ? 'results.unlock.wrong' : 'errors.unknown',
      );
    } finally {
      this.unlocking.set(false);
    }
  }

  lock(): void {
    this.encryption.lock();
    this.opened.set(new Map());
  }

  private async decryptAll(): Promise<void> {
    const key = this.encryption.unlocked();
    if (!key) return;
    const opened = new Map(this.opened());
    for (const sub of this.stored()) {
      if (!sub.encrypted || opened.has(sub.id) || sub.encrypted.keyId !== key.keyId) continue;
      try {
        opened.set(sub.id, await openSubmission(sub, key));
      } catch {
        // Damaged or tampered with: the submission stays locked.
      }
    }
    this.opened.set(opened);
  }

  back(): void {
    void this.router.navigate(['/']);
  }

  run(): void {
    if (this.formId()) void this.router.navigate(['/runner', this.formId()!]);
  }

  valueFor(sub: Submission, fieldId: string): string {
    const form = this.form();
    if (!form) return '—';
    if (sub.encrypted && !(fieldId in sub.values)) return this.i18n.t('results.locked');
    const row = rowForSubmission(form, sub, [{ fieldId, label: '' }], this.i18n);
    const v = row[fieldId].text;
    if (typeof v === 'string' && v !== '') return v;
    return '—';
  }

  clickValueFor(sub: Submission, fieldId: string): string {
    const form = this.form();
    if (!form) return '—';
    const row = rowForSubmission(form, sub, [{ fieldId, label: '' }], this.i18n);

    if ((row[fieldId]?.additional as { dataUrl: string })?.dataUrl) {
      window.open((row[fieldId]?.additional as { dataUrl: string }).dataUrl, '_blank');
    }

    const v = row[fieldId].text;
    if (typeof v === 'string' && v !== '') return v;
    return '—';
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  duration(ms: number): string {
    if (!ms) return '';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  async deleteOne(id: string): Promise<void> {
    const formId = this.formId();
    if (!formId) return;
    await this.repo.deleteSubmission(formId, id);
    await this.reload(formId);
    this.notifier.ok('results.submissionDeleted');
  }

  async clearAll(): Promise<void> {
    const formId = this.formId();
    if (!formId) return;
    await this.repo.clearSubmissions(formId);
    this.opened.set(new Map());
    await this.reload(formId);
    this.notifier.ok('results.allCleared');
  }

  async runChannel(ch: ExportChannel): Promise<void> {
    const form = this.form();
    const subs = this.submissions();
    if (!form || subs.length === 0 || this.lockedCount() > 0) return;
    const name = formName(form, this.i18n);
    try {
      const artifact = await ch.build({ ...form, name }, subs, this.i18n);
      if (artifact.kind === 'download') {
        downloadBlob(artifact.blob, artifact.filename);
      } else {
        window.location.assign(artifact.url);
      }
      this.notifier.ok(ch.doneKey ?? 'export.exported');
    } catch {
      this.notifier.error('export.failed');
    }
  }
}
