import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsRepository } from '../core/state/forms.repository';
import type { FormDefinition } from '@shared/model/form.model';
import type { Submission } from '@shared/model/submission.model';
import {
  buildColumns,
  rowForSubmission,
  EXPORT_CHANNELS,
  type ExportChannel,
} from '../core/export';
import { downloadBlob } from '../core/export';
import { I18nService } from '../core/i18n';

@Component({
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatSnackBarModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  selector: 'fm-results',
  templateUrl: './results.html',
  styleUrl: './results.scss',
})
export class Results {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly repo = inject(FormsRepository);
  private readonly snack = inject(MatSnackBar);
  protected readonly i18n = inject(I18nService);

  private readonly formId = signal<string | null>(null);
  protected readonly form = signal<FormDefinition | null>(null);
  protected readonly submissions = signal<Submission[]>([]);
  protected readonly columns = computed(() => (this.form() ? buildColumns(this.form()!) : []));
  protected readonly channels = EXPORT_CHANNELS;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.formId.set(id);
    if (id) void this.load(id);
  }

  private async load(id: string): Promise<void> {
    this.form.set(await this.repo.getForm(id));
    this.submissions.set(await this.repo.submissionsFor(id));
  }

  back(): void {
    void this.router.navigate(['/']);
  }

  run(): void {
    if (this.formId()) void this.router.navigate(['/runner', this.formId()!]);
  }

  valueFor(sub: Submission, fieldId: string): string {
    const row = rowForSubmission(sub, [{ fieldId, label: '' }]);
    const v = row[fieldId].text;
    if (typeof v === 'string' && v !== '') return v;
    return '—';
  }

  clickValueFor(sub: Submission, fieldId: string): string {
    const row = rowForSubmission(sub, [{ fieldId, label: '' }]);

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
    this.submissions.set(await this.repo.submissionsFor(formId));
    this.snack.open(this.i18n.t('results.submissionDeleted'), 'OK', { duration: 2000 });
  }

  async clearAll(): Promise<void> {
    const formId = this.formId();
    if (!formId) return;
    await this.repo.clearSubmissions(formId);
    this.submissions.set(await this.repo.submissionsFor(formId));
    this.snack.open(this.i18n.t('results.allCleared'), 'OK', { duration: 2000 });
  }

  async runChannel(ch: ExportChannel): Promise<void> {
    const form = this.form();
    const subs = this.submissions();
    if (!form || subs.length === 0) return;
    const ctx = {
      t: (key: string, params?: Record<string, string | number>) => this.i18n.t(key, params),
    };
    try {
      const artifact = await ch.build(form, subs, ctx);
      if (artifact.kind === 'download') {
        downloadBlob(artifact.blob, artifact.filename);
      } else {
        window.location.assign(artifact.url);
      }
      this.snack.open(this.i18n.t(ch.doneKey ?? 'export.exported'), 'OK', { duration: 2000 });
    } catch {
      this.snack.open(this.i18n.t('export.failed'), 'OK', { duration: 3000 });
    }
  }
}
