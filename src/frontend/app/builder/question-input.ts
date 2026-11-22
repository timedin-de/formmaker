import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, inject, input, viewChild } from '@angular/core';
import {
  FormsModule,
  ReactiveFormsModule,
  type AbstractControl,
  type FormControl,
} from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatOption, MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { has } from '@shared/helper';
import {
  scaleValues,
  type ElementDefinition,
  type FieldValue,
  type FileElement,
  type FileValue,
  type ScaleElement,
  type SignatureValue,
  type TextElement,
  type ValidationRuleType,
} from '@shared/model';
import { I18nService } from '../core/i18n';
import { MarkdownPipe } from '../core/markdown';
import type { ElementViewRef } from '../core/state/runner.model';
import { SignaturePadField } from '../runner/signature-pad';

/**
 * The input of a question, bound to its form control. The runner shows it beneath the question's
 * own title; the builder reuses it to enter fixed values (see `QuestionInputField`), passing a
 * `label` or `ariaLabel` because there is no title.
 */
@Component({
  templateUrl: './question-input.html',
  styleUrl: './question-input.scss',
  selector: 'fm-question-input',
  imports: [
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    SignaturePadField,
    MatIconModule,
    MatCheckboxModule,
    MatOption,
    NgTemplateOutlet,
    MatSelectModule,
    MatRadioModule,
    MarkdownPipe,
    MatButton,
    MatTooltipModule,
  ],
})
export class QuestionInput {
  readonly vr = input<ElementViewRef>();
  /** Floating label of text-like fields, for use without a question title. */
  readonly label = input<string>();
  /** Accessible name of text-like fields without a `label` or question title. */
  readonly ariaLabel = input<string>();
  protected readonly i18n = inject(I18nService);
  /** Main control: a native input, or a Material component (select, checkbox, radio, button). */
  private readonly field = viewChild<ElementRef<HTMLElement> | { focus(): void }>('field');

  focus(): void {
    const field = this.field();
    if (field instanceof ElementRef) {
      field.nativeElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
      field.nativeElement.focus({ preventScroll: true });
    } else field?.focus();
  }

  inputType(el: TextElement): string {
    const type = el.inputType ?? 'text';
    return type === 'phone' ? 'tel' : type;
  }
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
    return this.i18n.t('q.invalid', { field: this.vr()?.label ?? '' });
  }

  scaleValues(el: ScaleElement): number[] {
    return scaleValues(el) ?? [];
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

  /** Disables unchecked options once the `maxLength` rule's selection limit is reached. */
  multiDisabled(control: FormControl, value: string | number): boolean {
    const max = Number(this.validation('maxCount'));
    if (!Number.isFinite(max) || max <= 0 || this.multiChecked(control, value)) return false;
    return this.fileValue(control).length >= max;
  }

  fileValue(control: FormControl): FileValue[] {
    const v = control.value;
    return Array.isArray(v) ? (v as FileValue[]) : [];
  }

  async onFiles(control: FormControl, el: FileElement, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.value ? Array.from(input.files ?? []) : [];
    input.value = '';
    if (files.length === 0) return;

    const multiple = el.multiple ?? false;
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

  clearValue(control: FormControl): void {
    control.setValue(null);
    control.markAsTouched();
  }

  onSig(control: FormControl, value: FieldValue): void {
    control.setValue(value);
    control.markAsTouched();
  }

  /** A failed `@defer` chunk load can't be retried in place, so reload the page. */
  reload(): void {
    location.reload();
  }

  /** `step` in seconds for the native time pickers. */
  timeStep(el: ElementDefinition): number {
    if (has(el, 'timeInterval')) {
      const { value, multiplier } = el.timeInterval;
      return Number(multiplier) * Math.floor(value);
    }
    return 60;
  }

  validation(type: ValidationRuleType) {
    const el = this.vr()?.el;
    if (!el || !has(el, 'validations'))
      throw new Error('Called validations on non Question Element');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return el.validations.find((v) => v.rule === type)?.value as any | undefined;
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
