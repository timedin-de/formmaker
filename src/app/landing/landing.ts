import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsRepository } from '../core/state/forms.repository';
import type { FormDefinition } from '../core/model/form.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { downloadJSON, parseJsonFile } from '../core/export/file';
import { validateFormDefinition } from '../core/export/form-schema';

@Component({
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatToolbarModule,
    MatDividerModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  selector: 'fm-landing',
  template: `
    <div class="head">
      <div>
        <h1>Forms</h1>
        <p class="muted">
          Build once, fill many. Pages, conditions, piping, calculations, signatures.
        </p>
      </div>
      <div class="actions">
        <button mat-stroked-button (click)="fileInput.click()">
          <mat-icon>upload_file</mat-icon> Import JSON
        </button>
        <input
          #fileInput
          type="file"
          accept="application/json,.json"
          hidden
          (change)="onImport($event)"
        />
        <button mat-flat-button color="primary" routerLink="/builder" [queryParams]="{ new: '1' }">
          <mat-icon>add</mat-icon> New form
        </button>
      </div>
    </div>

    @if (forms().length === 0) {
      <mat-card class="empty"> No forms yet — create one or import a JSON definition. </mat-card>
    } @else {
      <div class="cards">
        @for (form of forms(); track form.id) {
          <mat-card class="card">
            <mat-card-header>
              <mat-card-title>{{ form.name }}</mat-card-title>
              <mat-card-subtitle>
                v{{ form.version }} · {{ form.pages.length }} pages ·
                {{ countQuestions(form) }} questions · {{ updated(form) }}
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <p class="muted desc">{{ form.description }}</p>
            </mat-card-content>
            <mat-card-actions align="end">
              <button mat-button [routerLink]="['/runner', form.id]">
                <mat-icon>play_circle_outline</mat-icon> Fill
              </button>
              <button mat-button routerLink="/builder" [queryParams]="{ id: form.id }">
                <mat-icon>edit</mat-icon> Edit
              </button>
              <button mat-button [routerLink]="['/results', form.id]">
                <mat-icon>bar_chart</mat-icon> Results
              </button>
              <button mat-icon-button (click)="exportJson(form)" matTooltip="Export JSON">
                <mat-icon>download</mat-icon>
              </button>
              <button mat-icon-button (click)="remove(form)" matTooltip="Delete">
                <mat-icon>delete_outline</mat-icon>
              </button>
            </mat-card-actions>
          </mat-card>
        }
      </div>
    }
  `,
  styles: [
    `
      .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 28px;
      }
      .head h1 {
        margin: 0;
      }
      .actions {
        display: flex;
        gap: 12px;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
      }
      .desc {
        margin: 8px 0 0;
        min-height: 20px;
      }
      .empty {
        margin: 28px;
        padding: 32px;
        text-align: center;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
        gap: 16px;
        padding: 12px 28px 40px;
      }
    `,
  ],
})
export class LandingComponent {
  private readonly repo = inject(FormsRepository);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  readonly forms = signal<FormDefinition[]>([]);

  constructor() {
    this.repo.seedDemo();
    this.refresh();
  }

  refresh(): void {
    this.forms.set(this.repo.listForms());
  }

  countQuestions(form: FormDefinition): number {
    let n = 0;
    const walk = (els: FormDefinition['pages'][number]['elements']) => {
      for (const el of els) {
        if ((el.type as string) === 'group') walk((el as { elements: typeof els }).elements);
        else if ((el.type as string) !== 'section') n += 1;
      }
    };
    form.pages.forEach((p) => walk(p.elements));
    return n;
  }

  updated(form: FormDefinition): string {
    if (!form.updatedAt) return 'n/a';
    return new Date(form.updatedAt).toLocaleDateString();
  }

  exportJson(form: FormDefinition): void {
    downloadJSON(form, toSlug(form.name) + '.json');
  }

  remove(form: FormDefinition): void {
    this.repo.deleteForm(form.id);
    this.refresh();
  }

  async onImport(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const { data } = await parseJsonFile<FormDefinition>(file);
    if (!data) {
      this.snack.open('Could not parse the file. Is it valid JSON?', 'OK', { duration: 4000 });
      return;
    }
    const issues = validateFormDefinition(data);
    if (issues.length > 0) {
      this.snack.open(`Invalid form definition: ${issues[0].message}`, 'OK', { duration: 6000 });
      return;
    }
    this.repo.saveForm(data);
    this.refresh();
    this.snack.open(`Imported "${data.name}"`, 'OK', { duration: 3000 });
  }
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
