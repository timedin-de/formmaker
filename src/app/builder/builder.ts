import { Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DesignerStore } from '../core/state/designer.store';
import { FormsRepository } from '../core/state/forms.repository';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { downloadJSON, parseJsonFile } from '../core/export/file';
import { validateFormDefinition } from '../core/export/form-schema';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BuilderCanvas } from './canvas';
import { BuilderPalette } from './palette';
import { PropertyPanel } from './property-panel';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';

@Component({
  imports: [
    FormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatSidenavModule,
    MatTabsModule,
    MatSnackBarModule,
    MatTooltipModule,
    BuilderCanvas,
    BuilderPalette,
    PropertyPanel,
  ],
  providers: [DesignerStore],
  selector: 'fm-builder',
  template: `
    <div class="main">
      <mat-toolbar class="sub">
        <div class="title-group">
          <mat-form-field appearance="outline" class="title-field" subscriptSizing="dynamic">
            <input
              matInput
              [ngModel]="store.form().name"
              (ngModelChange)="store.rename($event)"
              placeholder="Form name"
              aria-label="Form name"
            />
          </mat-form-field>
          <span class="muted">{{ store.form().pages.length }} pages</span>
        </div>
        <div class="actions">
          <button mat-button (click)="importInput.click()">
            <mat-icon>upload_file</mat-icon> Import
          </button>
          <input
            #importInput
            type="file"
            accept=".json,application/json"
            hidden
            (change)="onImport($event)"
          />
          <button mat-button (click)="export()"><mat-icon>download</mat-icon> Export</button>
          <button mat-button (click)="save()" [disabled]="saved()">
            <mat-icon>{{ saved() ? 'check' : 'save' }}</mat-icon> {{ saved() ? 'Saved' : 'Save' }}
          </button>
          <button mat-flat-button color="primary" (click)="preview()">
            <mat-icon>play_arrow</mat-icon> Preview
          </button>
        </div>
      </mat-toolbar>

      <div class="layout">
        <fm-builder-palette class="palette" [store]="store" />
        <fm-builder-canvas class="canvas" [store]="store" />
        <fm-property-panel class="panel" [store]="store" />
      </div>
    </div>
  `,
  styles: [
    `
      .main {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }
      .sub {
        gap: 16px;
        justify-content: space-between;
        background: var(--mat-sys-surface-container);
      }
      .title-group {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .title-field {
        width: 300px;
      }
      .actions {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .layout {
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr) 380px;
        gap: 16px;
        padding: 16px;
        flex: 1;
        min-height: 0;
      }
      .palette {
        overflow: auto;
      }
      .panel {
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .canvas {
        min-height: 0;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
      @media (max-width: 1100px) {
        .layout {
          grid-template-columns: 200px minmax(0, 1fr);
        }
        .panel {
          grid-column: 1 / -1;
          max-height: 60vh;
        }
      }
    `,
  ],
})
export class BuilderComponent {
  readonly store = inject(DesignerStore);
  private readonly repo = inject(FormsRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  readonly saved = signal(false);

  constructor() {
    // Load the working form: ?id= opens an existing form, ?new=1 a blank one.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .pipe(switchMap(async (q) => (q.get('id') ? this.repo.getForm(q.get('id')!) : null)))
      .subscribe((loaded) => {
        if (loaded) {
          this.store.load(loaded);
          this.snack.open(`Editing "${loaded.name}"`, 'OK', { duration: 2500 });
        } else {
          this.store.createEmpty();
          this.store.rename(`Untitled form (${new Date().toLocaleDateString()})`);
        }
      });

    effect(() => {
      // Auto-mark unsaved whenever the form struct changes after initial load.
      this.store.form();
      this.store.dirty();
      this.saved.set(false);
    });
  }

  save(): void {
    this.repo.saveForm(this.store.form());
    this.saved.set(true);
    this.snack.open('Form saved', 'OK', { duration: 2000 });
  }

  preview(): void {
    const kept = this.repo.saveForm(this.store.form());
    void this.router.navigate(['/runner', kept.id]);
  }

  export(): void {
    downloadJSON(this.store.form(), toSlug(this.store.form().name) + '.json');
  }

  async onImport(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const { data } = await parseJsonFile<Record<string, unknown>>(file);
    const issues = validateFormDefinition(data);
    if (!data || issues.length > 0) {
      this.snack.open(`Import failed: ${issues[0]?.message ?? 'invalid JSON'}`, 'OK', {
        duration: 6000,
      });
      return;
    }
    this.store.load(data as never);
    this.snack.open('Form imported', 'OK', { duration: 2500 });
  }
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
