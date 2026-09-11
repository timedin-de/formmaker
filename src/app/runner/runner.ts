import { Component, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { first, switchMap, tap } from 'rxjs';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RunnerStore, type RunnerPage } from '../core/state/runner.store';
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

  protected readonly Math = Math;
  protected readonly formLoaded = signal(false);

  protected pageSignal = computed<RunnerPage | null>(() => this.store.currentPage());
  protected submitLabel = computed(() => this.store.form()?.settings?.submitLabel ?? 'Submit');

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
          } else {
            this.snack.open('Form not found', 'OK', { duration: 4000 });
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
    void this.repo.addSubmission(result.submission);
    this.snack.open('Submitted', 'OK', { duration: 2000 });
    void this.router.navigate(['/results', this.store.form()!.id]);
  }
}
