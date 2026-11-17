import {
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, NavigationCancel, NavigationError, Router } from '@angular/router';
import { formName } from '@shared/helper';
import { toPortableForm } from '@shared/model/form.model';
import { pairwise, startWith } from 'rxjs';
import { downloadJSON } from '../core/export/file';
import { I18nService } from '../core/i18n';
import { Notifier } from '../core/notifier';
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
  private readonly notifier = inject(Notifier);
  protected readonly i18n = inject(I18nService);
  protected readonly modal = inject(PropertiesModal);

  private readonly propertiesDialog = viewChild<ElementRef<HTMLDialogElement>>('properties');
  private readonly leaveDialog = viewChild<ElementRef<HTMLDialogElement>>('leave');
  /** Answers the open leave dialog for the navigation `id` (if known); see `canLeave`. */
  private readonly leaveAnswer = signal<{
    id: number | undefined;
    resolve: (leave: boolean) => void;
  } | null>(null);
  protected readonly leaving = computed(() => this.leaveAnswer() !== null);
  private destroyed = false;
  /** Counts the forms asked to load from `?id=`; Preview opens only the latest. */
  private loadRequests = 0;

  readonly formName = formName;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    effect(() => {
      for (const el of [this.propertiesDialog(), this.leaveDialog()]) {
        const dialog = el?.nativeElement;
        if (dialog && !dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
      }
    });
    // Leave as asked once the edits that held it up have arrived after all.
    effect(() => {
      if (this.leaving() && !this.store.unsaved()) untracked(() => this.answerLeave(true));
    });
    // A newer navigation (e.g. Back to another page of the form, which runs no guard)
    // cancels the one the dialog asks about, so its answer would go nowhere.
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      const asked = this.leaveAnswer();
      const ended = event instanceof NavigationCancel || event instanceof NavigationError;
      if (ended && asked && asked.id === event.id) this.closeLeaveDialog();
    });
    // Load the working form: ?id= opens an existing form, ?new=1 a blank one.
    this.route.queryParams
      .pipe(startWith({ id: undefined, page: undefined }), pairwise(), takeUntilDestroyed())
      .subscribe(async ([oldParams, q]) => {
        if (!q.id || oldParams.id !== q.id) {
          this.loadRequests++;
          const loaded = q['id'] ? await this.repo.getForm(q['id']!) : null;
          if (loaded) {
            const name = formName(loaded, this.i18n);
            this.store.load(loaded);
            this.notifier.ok('builder.editing', { name });
          } else {
            await this.store.createEmpty();
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

    // Element, option and page edits are sent in the background; report a failed one.
    effect(() => {
      const failed = this.store.patchError();
      if (!failed) return;
      this.store.patchError.set(null);
      this.notifier.apiError(failed.error, failed.message);
    });
  }

  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.propertiesDialog()?.nativeElement) {
      this.closePropertiesDialog();
    }
  }

  /**
   * Opens the runner once every edit has reached the server (see `DesignerStore.flush`),
   * unless the builder was left or another form was asked for meanwhile (even if it is
   * still loading).
   */
  async preview(): Promise<void> {
    const formId = this.store.form().id;
    const request = this.loadRequests;
    const saved = await this.store.flush();
    if (!saved || this.destroyed || this.loadRequests !== request) return;
    this.router.navigate(['/runner', formId]);
  }

  export(): void {
    const form = this.store.form();
    const name = formName(form, this.i18n);
    downloadJSON(toPortableForm(form), toSlug(name) + '.json');
  }

  /**
   * Route guard: sends waiting edits, then leaves at once unless edits failed or are
   * still being sent. Then it shows them as unsaved and asks whether to leave anyway
   * (see `answerLeave`); once they arrive after all, it leaves without asking.
   */
  canLeave(): boolean | Promise<boolean> {
    // Otherwise waiting edits would be sent once the builder is gone, where a failure
    // goes unnoticed (a route change fires no `pagehide`).
    this.store.sendPending();
    if (!this.store.interruptLeave()) return true;
    // An earlier dialog closed already: this navigation canceled the one it asked about.
    const id = this.router.currentNavigation()?.id;
    return new Promise((resolve) => this.leaveAnswer.set({ id, resolve }));
  }

  protected answerLeave(leave: boolean): void {
    const answer = this.leaveAnswer();
    if (!answer) return;
    this.closeLeaveDialog();
    answer.resolve(leave);
  }

  private closeLeaveDialog(): void {
    this.leaveAnswer.set(null);
    const el = this.leaveDialog()?.nativeElement;
    if (el?.open) el.close();
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
