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
import type { FormDefinition } from '../core/model/form.model';
import type { Submission } from '../core/model/submission.model';
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
  template: `
    <mat-toolbar class="top">
      <button mat-icon-button (click)="back()" matTooltip="Back">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <div class="info">
        <span class="name">{{ form()?.name ?? 'Results' }}</span>
        <span class="muted">{{ submissions().length }} submission(s)</span>
      </div>
      <span class="spacer"></span>
      <button mat-button (click)="exportCsv()" [disabled]="submissions().length === 0">
        <mat-icon>download</mat-icon> CSV
      </button>
      <button mat-button (click)="exportExcel()" [disabled]="submissions().length === 0">
        <mat-icon>table_view</mat-icon> Excel
      </button>
      <button mat-button color="warn" (click)="clearAll()" [disabled]="submissions().length === 0">
        <mat-icon>delete_sweep</mat-icon> Clear
      </button>
    </mat-toolbar>

    <div class="body">
      @if (submissions().length === 0) {
        <div class="empty">
          <mat-icon>quiz</mat-icon>
          <p>No submissions yet for this form.</p>
          <button mat-stroked-button (click)="run()">
            <mat-icon>play_arrow</mat-icon> Fill it out
          </button>
        </div>
      } @else {
        <div class="cards">
          @for (sub of submissions(); track sub.id) {
            <mat-card class="submission-card">
              <mat-card-header>
                <mat-card-title>{{ formatDate(sub.submittedAt) }}</mat-card-title>
                <mat-card-subtitle>{{ duration(sub.durationMs) }}</mat-card-subtitle>
                <div class="spacer"></div>
                <button mat-icon-button matTooltip="Delete" (click)="deleteOne(sub.id)">
                  <mat-icon>delete_outline</mat-icon>
                </button>
              </mat-card-header>
              <mat-card-content>
                <div class="row">
                  @for (col of columns(); track col.fieldId) {
                    <div class="cell">
                      <span class="cell-label">{{ col.label }}</span>
                      <span class="cell-value">{{ valueFor(sub, col.fieldId) }}</span>
                    </div>
                  } @empty {
                    <div class="muted">No questions exported.</div>
                  }
                </div>
              </mat-card-content>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }
      .top {
        gap: 12px;
        background: var(--mat-sys-surface-container);
      }
      .info {
        display: flex;
        flex-direction: column;
        line-height: 1.2;
      }
      .name {
        font-weight: 500;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px;
      }
      .spacer {
        flex: 1;
      }
      .body {
        flex: 1;
        overflow: auto;
        padding: 20px;
        max-width: 980px;
        width: 100%;
        box-sizing: border-box;
        margin: 0 auto;
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 64px 0;
        color: var(--mat-sys-on-surface-variant);
      }
      .empty mat-icon {
        font-size: 52px;
        width: 52px;
        height: 52px;
      }
      .cards {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .submission-card {
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 14px;
      }
      .row {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 14px;
      }
      .cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .cell-label {
        font-size: 11px;
        color: var(--mat-sys-on-surface-variant);
        text-transform: uppercase;
        letter-spacing: 0.03em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cell-value {
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
  ],
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
    if (id) {
      this.form.set(this.repo.getForm(id));
      this.submissions.set(this.repo.submissionsFor(id));
    }
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

  deleteOne(id: string): void {
    this.repo.deleteSubmission(id);
    this.submissions.set(this.repo.submissionsFor(this.formId() ?? ''));
    this.snack.open('Submission deleted', 'OK', { duration: 2000 });
  }

  clearAll(): void {
    this.repo.clearSubmissions();
    this.submissions.set([]);
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
