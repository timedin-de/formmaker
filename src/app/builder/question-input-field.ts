import { Component, computed, input, output } from '@angular/core';
import { AbstractControl, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  ElementDefinition,
  ChoiceElement,
  ScaleElement,
  FileValue,
  SignatureValue,
  FieldValue,
} from '../shared/model';

@Component({
  templateUrl: './question-input-field.html',
  selector: 'fm-question-input-field',
  imports: [MatInputModule, FormsModule, ReactiveFormsModule, MatIconModule, MatCheckboxModule],
})
export class QuestionInputField {
  readonly config = input<{
    type: 'date';
    min?: Date;
    max?: Date;
    id?: string;
    control?: FormControl;
    value?: string;
  }>();
  readonly control = computed(() => this.config()?.control ?? new FormControl());

  readonly value = output<string>();

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
    return 'This field is invalid.';
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
