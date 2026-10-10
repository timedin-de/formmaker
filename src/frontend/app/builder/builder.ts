import { Component, effect, type ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { toPortableForm } from '@shared/model/form.model';
import { pairwise, startWith } from 'rxjs';
import { SNACK_TIME_OK } from '../core/consts';
import { downloadJSON } from '../core/export/file';
import { I18nService } from '../core/i18n';
import { DesignerStore } from '../core/state/designer.store';
import { FormsRepository } from '../core/state/forms.repository';
import { BuilderCanvas } from './canvas';
import { BuilderPalette } from './palette';
import { PropertiesModal } from './properties-modal';
import { PropertyPanel } from './property-panel';

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
  providers: [DesignerStore, PropertiesModal],
  selector: 'fm-builder',
  templateUrl: './builder.html',
  styleUrl: './builder.scss',
})
export class BuilderComponent {
  readonly store = inject(DesignerStore);
  private readonly repo = inject(FormsRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  protected readonly i18n = inject(I18nService);
  protected readonly modal = inject(PropertiesModal);

  private readonly propertiesDialog = viewChild<ElementRef<HTMLDialogElement>>('properties');

  readonly saved = signal(false);

  constructor() {
    effect(() => {
      const el = this.propertiesDialog()?.nativeElement;
      if (el && !el.open && typeof el.showModal === 'function') el.showModal();
    });
    // Load the working form: ?id= opens an existing form, ?new=1 a blank one.
    this.route.queryParams
      .pipe(startWith({ id: undefined, page: undefined }), pairwise(), takeUntilDestroyed())
      .subscribe(async ([oldParams, q]) => {
        if (!q.id || oldParams.id !== q.id) {
          const loaded = q['id'] ? await this.repo.getForm(q['id']!) : null;
          if (loaded) {
            this.store.load(loaded);
            this.snack.open(this.i18n.t('builder.editing', { name: loaded.name }), 'OK', {
              duration: SNACK_TIME_OK,
            });
          } else {
            this.store.createEmpty();
            this.store.rename(
              this.i18n.t('builder.untitled', { date: new Date().toLocaleDateString() }),
            );
            this.save();
            this.router.navigate([], {
              relativeTo: this.route,
              queryParams: { id: this.store.form().id, page: this.store.activePageId() },
            });
            return;
          }
        }
        if (oldParams.page !== q.page) {
          this.store.selectPage(q.page);
        }
        if (!q.page || oldParams.id !== q.id || oldParams.page !== q.page) {
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { page: this.store.activePageId() },
            queryParamsHandling: 'merge',
          });
        }
      });

    effect(() => {
      // Auto-mark unsaved whenever the form struct changes after initial load.
      this.store.form();
      this.store.dirty();
      this.saved.set(false);
    });
  }

  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.propertiesDialog()?.nativeElement) {
      this.closePropertiesDialog();
    }
  }

  async save(): Promise<void> {
    await this.repo.saveForm(this.store.form());
    this.saved.set(true);
    this.snack.open(this.i18n.t('builder.saveMsg'), 'OK', { duration: SNACK_TIME_OK });
  }

  async preview(): Promise<void> {
    const kept = await this.repo.saveForm(this.store.form());
    void this.router.navigate(['/runner', kept.id]);
  }

  export(): void {
    downloadJSON(toPortableForm(this.store.form()), toSlug(this.store.form().name) + '.json');
  }

  protected closePropertiesDialog(): void {
    const el = this.propertiesDialog()?.nativeElement;
    if (el?.open) el.close();
    this.modal.close();
  }
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
