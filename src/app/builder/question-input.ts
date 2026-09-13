import { Component, inject, input } from '@angular/core';
import { AbstractControl, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { SignaturePadField } from '../runner/signature-pad';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  ElementDefinition,
  ChoiceElement,
  ScaleElement,
  FileValue,
  SignatureValue,
  FieldValue,
  OTHER_OPTION,
  OtherOption,
} from '../shared/model';
import { ElementViewRef } from '../core';
import { QuestionInputField } from './question-input-field';
import { MatRadioModule } from '@angular/material/radio';
import { MatOption, MatSelectModule } from '@angular/material/select';
import { I18nService } from '../core/i18n';
import { MarkdownPipe } from '../core/markdown';

@Component({
  templateUrl: './question-input.html',
  selector: 'fm-question-input',
  imports: [
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    SignaturePadField,
    MatIconModule,
    MatCheckboxModule,
    QuestionInputField,
    MatOption,
    MatRadioModule,
    MarkdownPipe,
    MatSelectModule,
  ],
})
export class QuestionInput {
  readonly vr = input<ElementViewRef>();
  protected readonly i18n = inject(I18nService);

  protected readonly OTHER_OPTION = OTHER_OPTION();
  protected readonly date = (value: unknown) => value as Date;

  inputType(el: ElementDefinition): string {
    return (el as { inputType?: string }).inputType ?? 'text';
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

  multiChecked(control: FormControl, value: string | number | OtherOption): boolean {
    const current = (control.value as (string | number | OtherOption)[] | null) ?? [];

    if (typeof value === 'object') {
      return !!current.find((e) => typeof e === 'object');
    }

    return current.includes(value);
  }

  toggleMulti(control: FormControl, value: string | number | OtherOption, checked: boolean): void {
    const current = [...((control.value as (string | number | OtherOption)[] | null) ?? [])];

    if (typeof value === 'object') {
      const isIncluded = this.multiChecked(control, value);
      if (isIncluded) {
        control.setValue(current.filter((e) => !(typeof e === 'object')));
      } else {
        control.setValue([...current, value]);
      }
    } else {
      const next = checked
        ? current.includes(value)
          ? current
          : [...current, value]
        : current.filter((v) => v !== value);
      control.setValue(next);
    }

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
