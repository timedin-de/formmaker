import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSelect, type MatSelectChange } from '@angular/material/select';
import { MatTooltip } from '@angular/material/tooltip';
import {
  type ElementDefinition,
  type QuestionDefinition,
  VALIDATION_RULE_TYPES,
  validationRule,
  type ValidationRule,
  type ValidationRuleType,
} from '@shared/model';
import { DesignerStore } from '../core';
import { I18nService } from '../core/i18n';

@Component({
  templateUrl: './validation-editor.html',
  styleUrl: './validation-editor.scss',
  selector: 'fm-validation-editor',
  imports: [
    MatFormField,
    MatOption,
    MatSelect,
    MatTooltip,
    MatIcon,
    MatLabel,
    MatInput,
    MatButtonModule,
  ],
})
export class ValidationEditor {
  protected readonly VALIDATION_RULE_TYPES = VALIDATION_RULE_TYPES;
  protected readonly i18n = inject(I18nService);
  private readonly store = inject(DesignerStore);

  readonly validations = input.required<ValidationRule[]>();
  readonly element = input.required<ElementDefinition>();

  patch(patch: Partial<ElementDefinition>): void {
    this.store.updateElement(this.element().id, patch);
  }

  addRule(event: MatSelectChange): void {
    const el = this.element() as QuestionDefinition;
    this.patch({ validations: [...(el.validations ?? []), validationRule(event.value)] });
    event.source.value = undefined;
  }

  removeRule(id: string): void {
    const el = this.element() as QuestionDefinition;
    this.patch({ validations: (el.validations ?? []).filter((r) => r.id !== id) });
  }

  patchRule(id: string, patch: Partial<ValidationRule>): void {
    const el = this.element() as QuestionDefinition;
    this.patch({
      validations: (el.validations ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  }

  ruleLabel(rule: ValidationRuleType): string {
    return this.i18n.t(`val.${rule}`);
  }

  ruleInputKind(
    rule: ValidationRuleType,
  ): 'number' | 'text' | 'range' | 'pattern' | 'date' | 'accept' | 'expression' | 'none' {
    switch (rule) {
      case 'minLength':
      case 'maxLength':
      case 'min':
      case 'max':
      case 'minFiles':
      case 'maxFiles':
      case 'fileSizeMaxMb':
        return 'number';
      case 'between':
        return 'range';
      case 'pattern':
        return 'pattern';
      case 'dateMin':
      case 'dateMax':
        return 'date';
      case 'fileType':
        return 'accept';
      case 'custom':
        return 'expression';
      case 'required':
      case 'email':
      case 'url':
      case 'phone':
      case 'integer':
      case 'number':
        return 'none';
      default:
        return 'text';
    }
  }

  defaultRuleMessage(rule: ValidationRuleType): string {
    return this.i18n.t('panel.defaultMessage', { rule: this.i18n.t(`val.${rule}`) });
  }

  str(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  stringOrNum(raw: string): string | number {
    const s = String(raw).trim();
    if (s === '') return '';
    const n = Number(s);
    return s !== '' && !Number.isNaN(n) && /^-?\d*\.?\d+$/.test(s) ? n : s;
  }
}
