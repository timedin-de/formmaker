import { Component, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DesignerStore } from '../core/state/designer.store';
import { fieldMeta } from '../core/model/field-registry';
import type {
  ChoiceElement,
  DefaultValueDef,
  ElementDefinition,
  NumberElement,
} from '../core/model/form.model';
import type { ValidationRule, ValidationRuleType } from '../core/model/validation.model';
import { VALIDATION_RULE_TYPES, validationRule } from '../core/model/validation.model';
import { uuid } from '../core/model/ids';
import { ConditionEditor } from './condition-editor';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';

const WIDTHS = [
  { value: 'full', label: 'Full', factor: 1 },
  { value: 'half', label: 'Half', factor: 0.5 },
  { value: 'third', label: 'Third', factor: 0.33 },
] as const;

const INPUT_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'phone', label: 'Phone' },
  { value: 'number', label: 'Number' },
] as const;

@Component({
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatExpansionModule,
    ConditionEditor,
  ],
  selector: 'fm-property-panel',
  templateUrl: './property-panel.html',
  styleUrl: './property-panel.scss',
})
export class PropertyPanel {
  readonly store = input.required<DesignerStore>();

  protected readonly WIDTHS = WIDTHS;
  protected readonly INPUT_TYPES = INPUT_TYPES;
  protected readonly VALIDATION_RULE_TYPES = VALIDATION_RULE_TYPES;

  protected el = computed(() => this.store().selectedElement());
  protected meta = computed(() => (this.el() ? fieldMeta(this.el()!.type) : fieldMeta('text')));
  protected emptyGroup = computed(() => ({ logic: 'all' as const, conditions: [], groups: [] }));
  protected fields = computed(() =>
    this.store()
      .form()
      .pages.flatMap((p) => p.elements)
      .filter((e) => e.type !== 'section' && e.type !== 'group')
      .map((e) => ({ id: e.id, label: e.label })),
  );

  private sel(): ElementDefinition {
    const el = this.el();
    if (!el) throw new Error('No selected element');
    return el;
  }

  patch(patch: Partial<ElementDefinition>): void {
    this.store().updateElement(this.sel().id, patch);
  }

str(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  numOrUndef(raw: string): number | undefined {
    const s = String(raw).trim();
    if (s === '') return undefined;
    const n = Number(s);
    return Number.isNaN(n) ? undefined : n;
  }

  num(raw: string): number {
    const n = Number(String(raw).trim());
    return Number.isNaN(n) ? 0 : n;
  }

  stringOrNum(raw: string): string | number {
    const s = String(raw).trim();
    if (s === '') return '';
    const n = Number(s);
    return s !== '' && !Number.isNaN(n) && /^-?\d*\.?\d+$/.test(s) ? n : s;
  }

  wantsPlaceholder(el: ElementDefinition): boolean {
    return (
      el.type !== 'boolean' &&
      el.type !== 'signature' &&
      el.type !== 'scale' &&
      el.type !== 'choice' &&
      el.type !== 'dropdown' &&
      el.type !== 'multiChoice'
    );
  }

  isChoice(el: ElementDefinition): el is ChoiceElement {
    return el.type === 'choice' || el.type === 'dropdown' || el.type === 'multiChoice';
  }

  private choice(): ChoiceElement {
    const el = this.sel();
    if (!this.isChoice(el)) throw new Error('Not a choice');
    return el;
  }

  patchOption(index: number, patch: Partial<{ label: string; value: string | number }>): void {
    const choice = this.choice();
    const options = choice.options.map((o, i) => (i === index ? { ...o, ...patch } : o));
    this.patch({ options });
  }

  addOption(): void {
    const choice = this.choice();
    const idx = choice.options.length + 1;
    this.patch({
      options: [...choice.options, { id: uuid(), label: `Option ${idx}`, value: idx }],
    });
  }

  removeOption(index: number): void {
    const choice = this.choice();
    this.patch({ options: choice.options.filter((_, i) => i !== index) });
  }

  moveOption(index: number, dir: -1 | 1): void {
    const choice = this.choice();
    const next = [...choice.options];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    this.patch({ options: next });
  }

  // ---- default value ----------------------------------------------------------

  widthValue(w: number | 'full' | 'half' | 'third' | undefined): 'full' | 'half' | 'third' {
    if (w === 'full' || w === 'half' || w === 'third') return w;
    return 'full';
  }

  setWidth(value: string | number): void {
    if (value === 'full' || value === 'half' || value === 'third') {
      this.patch({ width: value });
    }
  }

  defaultKind(el: ElementDefinition): 'none' | 'static' | 'expression' | 'fromField' {
    return el.defaultValue?.kind ?? 'none';
  }

  setDefaultKind(kind: string): void {
    const make = (): DefaultValueDef | undefined => {
      switch (kind) {
        case 'static':
          return { kind: 'static', value: null };
        case 'expression':
          return { kind: 'expression', expression: '' };
        case 'field':
          return { kind: 'fromField', fieldId: this.fields()[0]?.id ?? '', transform: 'identity' };
        default:
          return undefined;
      }
    };
    this.patch({ defaultValue: make() });
  }

  staticText(el: ElementDefinition): string {
    const v = el.defaultValue?.kind === 'static' ? el.defaultValue.value : null;
    return v === null || v === undefined ? '' : String(v);
  }

  setStatic(raw: string): void {
    this.patch({ defaultValue: { kind: 'static', value: this.stringOrNum(raw) } });
  }

  exprText(el: ElementDefinition): string {
    return el.defaultValue?.kind === 'expression' ? el.defaultValue.expression : '';
  }

  setExpr(expression: string): void {
    this.patch({ defaultValue: { kind: 'expression', expression } });
  }

  fieldRef(el: ElementDefinition): string {
    return el.defaultValue?.kind === 'fromField' ? el.defaultValue.fieldId : '';
  }

  setFromField(fieldId: string): void {
    this.patch({ defaultValue: { kind: 'fromField', fieldId, transform: 'identity' } });
  }

  // ---- calculation ------------------------------------------------------------

  private numEl(): NumberElement {
    return this.sel() as NumberElement;
  }

  toggleCalc(on: boolean): void {
    this.patch(on ? { calculation: { formula: '' } } : { calculation: undefined });
  }

  setCalc(formula: string): void {
    this.patch({ calculation: { ...this.numEl().calculation!, formula } });
  }

  setCalcDecimals(raw: string): void {
    this.patch({
      calculation: { ...this.numEl().calculation!, decimals: this.numOrUndef(raw) },
    });
  }

  // ---- visibility -------------------------------------------------------------

  hasGroup(el: ElementDefinition): boolean {
    return (
      !!el.enabledWhen && (!!el.enabledWhen.conditions.length || !!el.enabledWhen.groups.length)
    );
  }

  clearGroup(): void {
    this.patch({ enabledWhen: undefined });
  }

  // ---- validation -------------------------------------------------------------

  ruleLabel(rule: ValidationRuleType): string {
    return VALIDATION_RULE_TYPES.find((r) => r.type === rule)?.label ?? rule;
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
    return `This field fails the "${this.ruleLabel(rule)}" check.`;
  }

  addRule(type: ValidationRuleType): void {
    const el = this.sel();
    this.patch({ validations: [...(el.validations ?? []), validationRule(type)] });
  }

  removeRule(id: string): void {
    const el = this.sel();
    this.patch({ validations: (el.validations ?? []).filter((r) => r.id !== id) });
  }

  patchRule(id: string, patch: Partial<ValidationRule>): void {
    const el = this.sel();
    this.patch({
      validations: (el.validations ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  }
}
