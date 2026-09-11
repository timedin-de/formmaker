import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsRepository } from '../core/state/forms.repository';
import type { FormDefinition } from '../shared/model/form.model';
import type { Submission } from '../shared/model/submission.model';
import { buildColumns, rowForSubmission } from '../core/export';
import { submissionsToCsv } from '../core/export';
import { submissionsToExcel } from '../core/export';
import { downloadBlob } from '../core/export';
import { signal } from '@angular/core';

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

  private readonly formId = signal<string | null>(null);
  protected readonly form = signal<FormDefinition | null>(null);
  protected readonly submissions = signal<Submission[]>([]);
  protected readonly columns = computed(() => (this.form() ? buildColumns(this.form()!) : []));

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
    const v = row[fieldId];
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
    this.snack.open('Submission deleted', 'OK', { duration: 2000 });
  }

  async clearAll(): Promise<void> {
    const formId = this.formId();
    if (!formId) return;
    await this.repo.clearSubmissions(formId);
    this.submissions.set(await this.repo.submissionsFor(formId));
    this.snack.open('All submissions cleared', 'OK', { duration: 2000 });
  }

  exportCsv(): void {
    const form = this.form();
    const subs = this.submissions();
    if (!form || subs.length === 0) return;
    downloadBlob(submissionsToCsv(form, subs), toSlug(form.name) + '-responses.csv');
  }

  async exportExcel(): Promise<void> {
    const form = this.form();
    const subs = this.submissions();
    if (!form || subs.length === 0) return;
    const blob = await submissionsToExcel(form, subs);
    downloadBlob(blob, toSlug(form.name) + '-responses.xlsx');
  }
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
