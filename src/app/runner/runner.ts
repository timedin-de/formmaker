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
  template: `
    <mat-toolbar class="top">
      <button mat-icon-button (click)="back()" matTooltip="Back">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <div class="info">
        <div class="name">{{ store.form()?.name }}</div>
        @if (store.form()?.settings?.showProgress && store.activePages().length > 1) {
          <div class="pg muted">
            {{ store.progress().index + 1 }} of {{ store.progress().total }}
          </div>
        }
      </div>
      <span class="spacer"></span>
      @if (store.activePages().length > 1) {
        <mat-progress-bar
          mode="determinate"
          class="bar"
          [value]="(store.progress().index / Math.max(1, store.progress().total - 1)) * 100"
        />
      }
    </mat-toolbar>

    @if (!formLoaded()) {
      <div class="waiting">Loading form…</div>
    } @else if (!pageSignal()) {
      <div class="waiting">No pages.</div>
    } @else {
      @if (pageSignal(); as page) {
        <div class="scroll">
        <header class="page-head">
          <h1>{{ page.title }}</h1>
          @if (page.subtitle) {
            <p class="subtitle">{{ page.subtitle }}</p>
          }
        </header>

        @for (vr of page.elements; track vr.id) {
          @if (vr.visible) {
            <div class="question" [class.compact]="vr.el.type === 'section'">
              @if (vr.el.type === 'section') {
                <mat-divider class="thin"></mat-divider>
                <div class="section-head">
                  <h3>{{ vr.label }}</h3>
                </div>
              } @else {
                <label class="label">
                  {{ vr.label }}
                  @if (vr.el.required) {
                    <span class="req">*</span>
                  }
                </label>
                @if (vr.description) {
                  <div class="desc">{{ vr.description }}</div>
                }

                @switch (vr.el.type) {
                  @case ('text') {
                    <mat-form-field
                      appearance="outline"
                      class="field-host"
                      subscriptSizing="dynamic"
                    >
                      <input
                        matInput
                        [formControl]="vr.control"
                        [placeholder]="vr.placeholder"
                        [type]="inputType(vr.el)"
                      />
                      @if (vr.control.touched && vr.control.errors) {
                        <mat-error>{{ errMsg(vr.control) }}</mat-error>
                      }
                    </mat-form-field>
                  }
                  @case ('longText') {
                    <mat-form-field
                      appearance="outline"
                      class="field-host"
                      subscriptSizing="dynamic"
                    >
                      <textarea
                        matInput
                        [formControl]="vr.control"
                        [placeholder]="vr.placeholder"
                        [rows]="rows(vr.el)"
                      ></textarea>
                      @if (vr.control.touched && vr.control.errors) {
                        <mat-error>{{ errMsg(vr.control) }}</mat-error>
                      }
                    </mat-form-field>
                  }
                  @case ('number') {
                    <div class="num-host" [class.disabled]="vr.el.type === 'number' && vr.computed">
                      <mat-form-field
                        appearance="outline"
                        class="field-host"
                        subscriptSizing="dynamic"
                      >
                        <input
                          matInput
                          type="number"
                          [formControl]="vr.control"
                          [placeholder]="vr.placeholder"
                        />
                        @if (vr.el.unit) {
                          <span matTextSuffix>{{ vr.el.unit }}</span>
                        }
                        @if (vr.control.touched && vr.control.errors) {
                          <mat-error>{{ errMsg(vr.control) }}</mat-error>
                        }
                      </mat-form-field>
                    </div>
                  }
                  @case ('boolean') {
                    <mat-checkbox [formControl]="vr.control">{{ vr.label }}</mat-checkbox>
                  }
                  @case ('choice') {
                    <mat-radio-group class="choice-group" [formControl]="vr.control">
                      @for (opt of options(vr.el); track opt.id) {
                        <mat-radio-button [value]="opt.value">{{ opt.label }}</mat-radio-button>
                      }
                    </mat-radio-group>
                    @if (vr.control.touched && vr.control.errors) {
                      <mat-error>{{ errMsg(vr.control) }}</mat-error>
                    }
                  }
                  @case ('dropdown') {
                    <mat-form-field
                      appearance="outline"
                      class="field-host"
                      subscriptSizing="dynamic"
                    >
                      <mat-select [formControl]="vr.control">
                        @for (opt of options(vr.el); track opt.id) {
                          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                        }
                      </mat-select>
                      @if (vr.control.touched && vr.control.errors) {
                        <mat-error>{{ errMsg(vr.control) }}</mat-error>
                      }
                    </mat-form-field>
                  }
                  @case ('multiChoice') {
                    <div class="choice-group">
                      @for (opt of options(vr.el); track opt.id) {
                        <mat-checkbox
                          [value]="strOpt(opt.value)"
                          [checked]="multiChecked(vr.control, opt.value)"
                          (change)="toggleMulti(vr.control, opt.value, $event.checked)"
                        >
                          {{ opt.label }}
                        </mat-checkbox>
                      }
                    </div>
                    @if (vr.control.touched && vr.control.errors) {
                      <mat-error>{{ errMsg(vr.control) }}</mat-error>
                    }
                  }
                  @case ('scale') {
                    <div class="scale">
                      @for (val of scaleValues(vr.el); track val) {
                        <button
                          type="button"
                          class="scale-val"
                          [class.on]="vr.control.value === val"
                          (click)="setScale(vr.control, val)"
                        >
                          {{ val }}
                        </button>
                      }
                    </div>
                    @if (hasScaleLabels(vr.el)) {
                      <div class="scale-labels">
                        <span>{{ scaleMinLabel(vr.el) }}</span>
                        <span>{{ scaleMaxLabel(vr.el) }}</span>
                      </div>
                    }
                    @if (vr.control.touched && vr.control.errors) {
                      <mat-error>{{ errMsg(vr.control) }}</mat-error>
                    }
                  }
                  @case ('date') {
                    <mat-form-field
                      appearance="outline"
                      class="field-host"
                      subscriptSizing="dynamic"
                    >
                      <input matInput type="date" [formControl]="vr.control" />
                      @if (vr.control.touched && vr.control.errors) {
                        <mat-error>{{ errMsg(vr.control) }}</mat-error>
                      }
                    </mat-form-field>
                  }
                  @case ('time') {
                    <mat-form-field
                      appearance="outline"
                      class="field-host"
                      subscriptSizing="dynamic"
                    >
                      <input matInput type="time" [formControl]="vr.control" />
                      @if (vr.control.touched && vr.control.errors) {
                        <mat-error>{{ errMsg(vr.control) }}</mat-error>
                      }
                    </mat-form-field>
                  }
                  @case ('dateTime') {
                    <mat-form-field
                      appearance="outline"
                      class="field-host"
                      subscriptSizing="dynamic"
                    >
                      <input matInput type="datetime-local" [formControl]="vr.control" />
                      @if (vr.control.touched && vr.control.errors) {
                        <mat-error>{{ errMsg(vr.control) }}</mat-error>
                      }
                    </mat-form-field>
                  }
                  @case ('file') {
                    <div class="files">
                      <div class="file-drop">
                        <input
                          #fileInput
                          type="file"
                          [multiple]="fileMultiple(vr.el)"
                          hidden
                          (change)="onFiles(vr.control, vr.el, $event)"
                        />
                        <button mat-stroked-button type="button" (click)="fileInput.click()">
                          <mat-icon>attach_file</mat-icon> Choose files
                        </button>
                      </div>
                      @for (f of fileList(vr.control); track f.name) {
                        <div class="file-chip">
                          <mat-icon>description</mat-icon>
                          <span class="fname">{{ f.name }}</span>
                          <button mat-icon-button type="button" (click)="removeFile(vr.control, f)">
                            <mat-icon>close</mat-icon>
                          </button>
                        </div>
                      }
                      @if (vr.control.touched && vr.control.errors) {
                        <mat-error>{{ errMsg(vr.control) }}</mat-error>
                      }
                    </div>
                  }
                  @case ('signature') {
                    <fm-signature-pad
                      [initialValue]="sigValue(vr.control)"
                      (write)="onSig(vr.control, $event)"
                    />
                    @if (vr.control.touched && vr.control.errors) {
                      <mat-error>{{ errMsg(vr.control) }}</mat-error>
                    }
                  }
                }
              }
            </div>
          }
        }

        <div class="nav">
          @if (store.canPrev()) {
            <button mat-stroked-button (click)="prev()">
              <mat-icon>arrow_back</mat-icon> Back
            </button>
          }
          <span class="spacer"></span>
          @if (!store.isLast()) {
            <button mat-flat-button color="primary" (click)="next()">
              Next <mat-icon>arrow_forward</mat-icon>
            </button>
          } @else {
            <button mat-flat-button color="primary" (click)="submit()">
              <mat-icon>send</mat-icon> {{ submitLabel() }}
            </button>
          }
        </div>
        </div>
      } @else {
        <div class="waiting">No pages on this form.</div>
      }
    }
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
        gap: 2px;
      }
      .name {
        font-weight: 500;
      }
      .pg {
        font-size: 12px;
      }
      .bar {
        width: 180px;
      }
      .spacer {
        flex: 1;
      }
      .waiting {
        padding: 48px;
        text-align: center;
        color: var(--mat-sys-on-surface-variant);
      }
      .scroll {
        flex: 1;
        overflow: auto;
        max-width: 760px;
        width: 100%;
        margin: 0 auto;
        padding: 28px 20px 40px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .page-head h1 {
        margin: 0 0 4px;
        font-size: 26px;
      }
      .page-head .subtitle,
      .desc {
        color: var(--mat-sys-on-surface-variant);
        margin: 0;
      }
      .question {
        padding: 18px;
        background: var(--mat-sys-surface);
        border-radius: 14px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        border: 1px solid var(--mat-sys-outline-variant);
      }
      .question.compact {
        box-shadow: none;
        border: 0;
        padding: 8px 4px;
      }
      .label {
        font-weight: 500;
        display: block;
        margin-bottom: 4px;
      }
      .req {
        color: var(--mat-sys-error);
      }
      .field-host {
        width: 100%;
      }
      .num-host.disabled {
        opacity: 0.75;
      }
      .choice-group {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-top: 4px;
      }
      .scale {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .scale-val {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        border: 1px solid var(--mat-sys-outline);
        background: var(--mat-sys-surface-container-low);
        cursor: pointer;
        font-weight: 600;
        color: var(--mat-sys-on-surface);
        transition: all 0.1s ease;
      }
      .scale-val.on {
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
        border-color: var(--mat-sys-primary);
      }
      .scale-labels {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .files {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .file-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 10px;
      }
      .fname {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
      }
      .section-head h3 {
        margin: 6px 0 0;
        color: var(--mat-sys-primary);
      }
      .nav {
        display: flex;
        gap: 12px;
        padding: 20px 0 0;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
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
