import { Component, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { first, switchMap, tap } from 'rxjs';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RunnerStore } from '../core/state/runner.store';
import { FormsRepository } from '../core/state/forms.repository';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { QuestionList } from './questionList/question-list';
import { I18nService } from '../core/i18n';
import { MarkdownPipe } from '../core/markdown';
import { MatTooltip } from '@angular/material/tooltip';
import { submissionToPdf, downloadBlob, toSlug } from '../core/export';
import type { Submission } from '@shared/model/submission.model';
import { RunnerPage } from '@shared/model';

@Component({
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatRadioModule,
    MatSelectModule,
    MatSnackBarModule,
    MatToolbarModule,
    QuestionList,
    MarkdownPipe,
    MatTooltip,
  ],
  providers: [RunnerStore],
  selector: 'fm-runner',
  templateUrl: './runner.html',
  styleUrl: './runner.scss',
})
export class Runner {
  readonly store = inject(RunnerStore);
  private readonly repo = inject(FormsRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  protected readonly i18n = inject(I18nService);

  protected readonly Math = Math;
  protected readonly formLoaded = signal(false);
  protected lastSubmission = signal<Submission | null>(null);

  protected pageSignal = computed<RunnerPage | null>(() => this.store.currentPage());
  protected submitLabel = computed(
    () => this.store.form()?.settings?.submitLabel ?? this.i18n.t('runner.submit'),
  );

  constructor() {
    this.route.queryParams.pipe(first()).subscribe((q) => {
      if (q['page']) {
        this.store.goTo(q['page']);
      }
    });

    this.route.paramMap
      .pipe(
        takeUntilDestroyed(),
        switchMap(async (params) => {
          const id = params.get('id');
          if (!id) return null;
          try {
            return (await this.repo.getForm(id)) ?? null;
          } catch {
            return null;
          }
        }),
        tap((form) => {
          if (form) {
            this.store.init(form);
            this.formLoaded.set(true);
            if (this.store.restoredDraft()) {
              this.snack.open(this.i18n.t('runner.draftRestored'), 'OK', { duration: 4000 });
            }
          } else {
            this.snack.open(this.i18n.t('runner.formNotFound'), 'OK', { duration: 4000 });
            void this.router.navigate(['/']);
          }
        }),
      )
      .subscribe();
  }

  back(): void {
    void this.router.navigate(['/']);
  }

  next(): void {
    const ok = this.store.next();
    if (!ok) {
      const page = this.store.currentPage();
      if (page) this.store.markPageTouched(page);
    } else {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParamsHandling: 'merge',
        queryParams: { page: this.pageSignal()?.index },
      });
    }
  }

  prev(): void {
    this.store.prev();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: 'merge',
      queryParams: { page: this.pageSignal()?.index },
    });
  }

  submit(): void {
    const result = this.store.submit();
    if (!result) {
      for (const page of this.store.pages()) {
        if (page.visible) this.store.markPageTouched(page);
      }
      return;
    }
    this.lastSubmission.set(result.submission);
    void this.repo.addSubmission(result.submission);
    this.snack.open(this.i18n.t('runner.submitted'), 'OK', { duration: 2000 });
  }

  async downloadReceipt(): Promise<void> {
    const form = this.store.form();
    const submission = this.lastSubmission();
    if (!form || !submission) return;
    const blob = await submissionToPdf(form, submission);
    downloadBlob(blob, toSlug(this.i18n.t('pdf.receipt', { name: form.name })) + '.pdf');
  }

  fillAgain(): void {
    this.store.reset();
    void this.router.navigate([], { relativeTo: this.route, queryParams: { page: 0 } });
  }

  goHome(): void {
    void this.router.navigate(['/']);
  }
}
