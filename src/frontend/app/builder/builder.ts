import { Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DesignerStore } from '../core/state/designer.store';
import { FormsRepository } from '../core/state/forms.repository';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { downloadJSON } from '../core/export/file';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BuilderCanvas } from './canvas';
import { BuilderPalette } from './palette';
import { PropertyPanel } from './property-panel';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { pairwise, startWith } from 'rxjs';
import { I18nService } from '../core/i18n';
import { FormImportService } from '../core/export/import';

@Component({
  imports: [
    FormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatButtonToggleModule,
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
  templateUrl: './builder.html',
  styleUrl: './builder.scss',
})
export class BuilderComponent {
  readonly store = inject(DesignerStore);
  private readonly importService = inject(FormImportService);
  private readonly repo = inject(FormsRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  protected readonly i18n = inject(I18nService);
  readonly saved = signal(false);
  readonly mode = signal<'split' | 'wysiwyg'>('split');

  setMode(value: string): void {
    if (value === 'split' || value === 'wysiwyg') this.mode.set(value);
  }

  constructor() {
    // Load the working form: ?id= opens an existing form, ?new=1 a blank one.
    this.route.queryParams
      .pipe(startWith({ id: undefined, page: undefined }), pairwise(), takeUntilDestroyed())
      .subscribe(async ([oldParams, q]) => {
        if (!q.id || oldParams.id !== q.id) {
          const loaded = q['id'] ? await this.repo.getForm(q['id']!) : null;
          if (loaded) {
            this.store.load(loaded);
            this.snack.open(this.i18n.t('builder.editing', { name: loaded.name }), 'OK', {
              duration: 2500,
            });
          } else {
            this.store.createEmpty();
            this.store.rename(
              this.i18n.t('builder.untitled', { date: new Date().toLocaleDateString() }),
            );
            this.save();
            this.router.navigate([], {
              relativeTo: this.route,
              queryParams: { id: this.store.form().id },
            });
          }
        }
        if (oldParams.page !== q.page) {
          this.store.selectPage(q.page);
        }
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { page: this.store.activePageId() },
          queryParamsHandling: 'merge',
        });
      });

    effect(() => {
      // Auto-mark unsaved whenever the form struct changes after initial load.
      this.store.form();
      this.store.dirty();
      this.saved.set(false);
    });
  }

  async save(): Promise<void> {
    await this.repo.saveForm(this.store.form());
    this.saved.set(true);
    this.snack.open(this.i18n.t('builder.saveMsg'), 'OK', { duration: 2000 });
  }

  async preview(): Promise<void> {
    const kept = await this.repo.saveForm(this.store.form());
    void this.router.navigate(['/runner', kept.id]);
  }

  export(): void {
    downloadJSON(this.store.form(), toSlug(this.store.form().name) + '.json');
  }
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
