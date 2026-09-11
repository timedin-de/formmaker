import { Component, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, tap } from 'rxjs';
import {
  FormsModule,
  ReactiveFormsModule,
  type AbstractControl,
  type FormControl,
} from '@angular/forms';
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
import type { ElementDefinition, ChoiceElement, ScaleElement } from '../core/model/form.model';
import type { FieldValue, FileValue, SignatureValue } from '../core/model/values.model';
import { SignaturePadField } from './signature-pad';

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
    SignaturePadField,
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
    }
  }

  prev(): void {
    this.store.prev();
  }

  submit(): void {
    const result = this.store.submit();
    if (!result) {
      for (const page of this.store.pages()) {
        if (page.visible) this.store.markPageTouched(page);
      }
      return;
    }
    this.repo.addSubmission(result.submission);
    this.snack.open('Submitted', 'OK', { duration: 2000 });
    void this.router.navigate(['/results', this.store.form()!.id]);
  }

  // ---- template helpers -----------------------------------------------------

  errMsg(control: AbstractControl): string {
    const errors = control.errors;
    if (!errors) return '';
    const first = errors[Object.keys(errors)[0]];
    if (first && typeof first === 'object' && 'message' in first)
      return String((first as { message: string }).message);
    if (typeof first === 'string') return first;
    for (const key of Object.keys(errors)) {
      if (key !== 'message' && errors[key]?.message) return String(errors[key].message);
    }
    return 'This field is invalid.';
  }

  inputType(el: ElementDefinition): string {
    return (el as { inputType?: string }).inputType ?? 'text';
  }

  rows(el: ElementDefinition): number {
    return (el as { rows?: number }).rows ?? 4;
  }

  options(el: ElementDefinition): ChoiceElement['options'] {
    return (el as ChoiceElement).options ?? [];
  }

  strOpt(value: string | number): string {
    return String(value);
  }

  scaleValues(el: ElementDefinition): number[] {
    const s = el as ScaleElement;
    const out: number[] = [];
    for (let v = s.min; v <= s.max + 1e-9; v += s.step) out.push(Math.round(v * 100) / 100);
    return out;
  }

  hasScaleLabels(el: ElementDefinition): boolean {
    const s = el as ScaleElement;
    return !!s.minLabel || !!s.maxLabel;
  }

  scaleMinLabel(el: ElementDefinition): string {
    return (el as ScaleElement).minLabel ?? '';
  }

  scaleMaxLabel(el: ElementDefinition): string {
    return (el as ScaleElement).maxLabel ?? '';
  }

  setScale(control: FormControl, value: number): void {
    control.setValue(value);
    control.markAsTouched();
  }

  multiChecked(control: FormControl, value: string | number): boolean {
    const current = (control.value as (string | number)[] | null) ?? [];
    return current.includes(value);
  }

  toggleMulti(control: FormControl, value: string | number, checked: boolean): void {
    const current = [...((control.value as (string | number)[] | null) ?? [])];
    const next = checked
      ? current.includes(value)
        ? current
        : [...current, value]
      : current.filter((v) => v !== value);
    control.setValue(next);
    control.markAsTouched();
  }

  fileMultiple(el: ElementDefinition): boolean {
    return (el as { multiple?: boolean }).multiple ?? false;
  }

  fileValue(control: FormControl): FileValue[] {
    const v = control.value;
    return Array.isArray(v) ? (v as FileValue[]) : [];
  }

  fileList(control: FormControl): FileValue[] {
    return this.fileValue(control);
  }

  async onFiles(control: FormControl, el: ElementDefinition, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.value ? Array.from(input.files ?? []) : [];
    input.value = '';
    if (files.length === 0) return;

    const multiple = (el as { multiple?: boolean }).multiple ?? false;
    let next = multiple ? [...this.fileValue(control)] : [];
    const mapped: FileValue[] = [];
    for (const file of files) {
      const dataUrl = await readAsDataUrl(file);
      mapped.push({ name: file.name, size: file.size, mimeType: file.type, dataUrl });
    }
    if (!multiple) next = [];
    next = [...next, ...mapped];
    control.setValue(next);
    control.markAsTouched();
  }

  removeFile(control: FormControl, file: FileValue): void {
    control.setValue(this.fileValue(control).filter((f) => f !== file));
    control.markAsTouched();
  }

  sigValue(control: FormControl): SignatureValue | null {
    const v = control.value;
    return v && typeof v === 'object' && 'dataUrl' in (v as Record<string, unknown>)
      ? (v as SignatureValue)
      : null;
  }

  onSig(control: FormControl, value: FieldValue): void {
    control.setValue(value);
    control.markAsTouched();
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
