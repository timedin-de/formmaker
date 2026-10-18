import { Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { has } from '@shared/helper';
import { childrenOf } from '@shared/model/form-tree';
import type {
  ChoiceElement,
  DefaultValueDef,
  ElementDefinition,
  GroupElement,
  PageDefinition,
  QuestionDefinition,
  TimeElement,
} from '@shared/model/form.model';
import { DEFAULT_TIME_INTERVAL, TIME_INTERVAL_UNITS } from '@shared/model/form.model';
import { uuid } from '@shared/model/ids';
import { VALIDATION_RULE_TYPES } from '@shared/model/validation.model';
import { I18nService } from '../core/i18n';
import { fieldMeta } from '../core/model/field-registry';
import { type DesignerStore } from '../core/state/designer.store';
import { ConditionEditor } from './condition-editor';
import { QuestionSelector } from './question-selector';
import { ValidationEditor } from './validation-editor';

const WIDTHS = Array.from(
  { length: 12 },
  (_, i) => ({ label: `${i + 1}/12`, factor: (i + 1) / 12 }) as const,
);

const INPUT_TYPES = ['text', 'email', 'url', 'phone', 'number'] as const;

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
    QuestionSelector,
    ValidationEditor,
  ],
  selector: 'fm-property-panel',
  templateUrl: './property-panel.html',
  styleUrl: './property-panel.scss',
})
export class PropertyPanel {
  readonly store = input.required<DesignerStore>();
  protected readonly i18n = inject(I18nService);

  protected readonly WIDTHS = WIDTHS;
  protected readonly INPUT_TYPES = INPUT_TYPES;
  protected readonly VALIDATION_RULE_TYPES = VALIDATION_RULE_TYPES;
  protected readonly TIME_INTERVAL_UNITS = TIME_INTERVAL_UNITS;
  protected readonly has = has;

  protected readonly el = computed(() => this.store().selectedElement());
  protected readonly meta = computed(() =>
    this.el() ? fieldMeta(this.el()!.type) : fieldMeta('text'),
  );
  protected readonly emptyGroup = computed(() => ({
    logic: 'all' as const,
    conditions: [],
    groups: [],
  }));
  protected readonly form = computed(() => this.store().form());

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
    const options = choice.options ?? [];
    const idx = options.length + 1;
    this.patch({
      options: [
        ...options,
        { id: uuid(), label: `${this.i18n.t('panel.option')} ${idx}`, value: idx },
      ],
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

  setWidth(value: number): void {
    this.patch({ width: value });
  }

  setDefaultKind(kind: string): void {
    const make = (): DefaultValueDef | null => {
      switch (kind) {
        case 'static':
          return { kind: 'static', value: null };
        case 'expression':
          return { kind: 'expression', expression: '' };
        case 'fromField':
          return { kind: 'fromField', fieldId: '' };
        default:
          return null;
      }
    };
    this.patch({ defaultValue: make() });
  }

  staticText(el: ElementDefinition): string {
    const q = el as QuestionDefinition;
    const v = q.defaultValue?.kind === 'static' ? q.defaultValue.value : null;
    return v === null || v === undefined ? '' : String(v);
  }

  setStatic(raw: string): void {
    this.patch({ defaultValue: { kind: 'static', value: this.stringOrNum(raw) } });
  }

  exprText(el: ElementDefinition): string {
    const q = el as QuestionDefinition;
    return q.defaultValue?.kind === 'expression' ? q.defaultValue.expression : '';
  }

  setExpr(expression: string): void {
    this.patch({ defaultValue: { kind: 'expression', expression } });
  }

  fieldRef(el: ElementDefinition): string {
    const q = el as QuestionDefinition;
    return q.defaultValue?.kind === 'fromField' ? q.defaultValue.fieldId : '';
  }

  setFromField(field: ElementDefinition): void {
    const selected = this.sel();
    const patches: [string, Partial<ElementDefinition>][] = [
      [selected.id, { defaultValue: { kind: 'fromField', fieldId: field.id } }],
    ];
    // A group copies from another group: each child takes its default from the
    // source child at the same position, recursively.
    const pair = (target: GroupElement, source: GroupElement): void => {
      const form = this.form();
      const sources = childrenOf(form, source);
      childrenOf(form, target).forEach((child, i) => {
        const src = sources[i];
        if (!src) return;
        if (child.type === 'group' && src.type === 'group') pair(child, src);
        if (has(child, 'defaultValue')) {
          patches.push([child.id, { defaultValue: { kind: 'fromField', fieldId: src.id } }]);
        }
      });
    };
    if (selected.type === 'group' && field.type === 'group') pair(selected, field);
    this.store().updateElements(patches);
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
  isSameGroup = (element: ElementDefinition | PageDefinition) => {
    if (!has(element, 'type')) return true;
    const thisGroup = this.el();
    if (thisGroup?.type !== 'group') return false;
    return element.type === 'group' && thisGroup.elements.length === element.elements.length;
  };

  // ---- time interval ---------------------------------------------------------

  isTimeElement(el: ElementDefinition): el is TimeElement {
    return has(el, 'timeInterval');
  }

  patchTimeInterval(patch: Partial<TimeElement['timeInterval']>): void {
    const el = this.el();
    if (!el || !this.isTimeElement(el)) return;
    this.patch({ timeInterval: { ...el.timeInterval, ...patch } });
  }

  /** Interval values are whole units ≥ 1 — anything else falls back to the default. */
  intervalValue(raw: string): number {
    const n = Number(String(raw).trim());
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_TIME_INTERVAL.value;
  }
}
