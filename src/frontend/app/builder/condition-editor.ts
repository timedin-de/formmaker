import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { isChoice } from '@shared/helper';
import { type FieldValue, type FormDocument } from '@shared/model';
import type {
  Condition,
  ConditionGroup,
  ConditionOperand,
  ConditionOperator,
  LiteralOperand,
  LiteralValue,
} from '@shared/model/conditions.model';
import { conditionOperatorsFor, emptyCondition } from '@shared/model/conditions.model';
import type { ChoiceElement, ElementDefinition, ElementType } from '@shared/model/form.model';
import { I18nService } from '../core/i18n';
import { OptionPicker } from './option-picker';
import { QuestionInputField } from './question-input-field';
import { QuestionSelector } from './question-selector';
import { parseRaw, valueKindOf } from './value-kind';

const NEEDS_RIGHT: Record<ConditionOperator, 'operand' | 'list' | 'range' | 'none'> = {
  eq: 'operand',
  neq: 'operand',
  gt: 'operand',
  gte: 'operand',
  lt: 'operand',
  lte: 'operand',
  contains: 'operand',
  notContains: 'operand',
  startsWith: 'operand',
  endsWith: 'operand',
  isEmpty: 'none',
  isNotEmpty: 'none',
  in: 'list',
  notIn: 'list',
  between: 'range',
};

/** Question types whose values are option ids of that one question. */
const CHOICE_TYPES = new Set<ElementType>(['choice', 'dropdown', 'multiChoice']);

export interface ConditionFieldOption {
  id: string;
  label: string;
}

@Component({
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatDividerModule,
    OptionPicker,
    QuestionSelector,
    QuestionInputField,
  ],
  selector: 'fm-condition-editor',
  templateUrl: './condition-editor.html',
  styleUrl: './condition-editor.scss',
})
export class ConditionEditor {
  readonly group = input<ConditionGroup>({ logic: 'all', conditions: [], groups: [] });
  readonly form = input.required<FormDocument>();
  protected readonly i18n = inject(I18nService);

  readonly self = input.required<string>();
  readonly legend = input<string>('When');
  readonly indent = input(false);
  readonly changed = output<ConditionGroup>();

  private readonly source = signal<ConditionGroup>({ logic: 'all', conditions: [], groups: [] });
  protected edit = computed(() => this.source());

  constructor() {
    effect(() => this.source.set(cloneGroup(this.group())));
  }

  rightKind(op: ConditionOperator): 'operand' | 'list' | 'range' | 'none' {
    return NEEDS_RIGHT[op];
  }

  operandKind(cond: Condition): ConditionOperand['kind'] {
    return cond.operand?.kind ?? 'literal';
  }

  fieldOperandId(cond: Condition): string {
    const op = cond.operand;
    return op?.kind === 'field' ? op.fieldId : '';
  }

  /** The stored literal of an operand, as is (no coercion for display). */
  literal(operand: ConditionOperand | undefined): LiteralOperand['value'] {
    return operand?.kind === 'literal' ? operand.value : null;
  }

  /** The literal of a list operator as its items. */
  listItems(cond: Condition): LiteralValue[] {
    const value = this.literal(cond.operand);
    return Array.isArray(value) ? value : value === null ? [] : [value];
  }

  /** Option ids picked for a list operator on a choice question. */
  optionIds(cond: Condition): string[] {
    return this.listItems(cond).map(String);
  }

  listText(cond: Condition): string {
    return this.listItems(cond).map(String).join(', ');
  }

  setLogic(logic: 'all' | 'any'): void {
    this.mutate((g) => (g.logic = logic));
  }

  /**
   * Operators offered for a condition: those fitting the tested field's type, plus the stored
   * one so a condition saved before stays visible.
   */
  operators(cond: Condition): ConditionOperator[] {
    const fitting = conditionOperatorsFor(this.fieldOf(cond)?.type);
    return fitting.includes(cond.operator) ? fitting : [...fitting, cond.operator];
  }

  set(index: number, patch: Partial<Condition>): void {
    this.mutate((g) => Object.assign(g.conditions[index], patch));
  }

  /** Changes the operator, keeping the literal in the shape it now needs (see `fitLiteral`). */
  setOperator(index: number, operator: ConditionOperator): void {
    this.mutate((g) => {
      const cond = g.conditions[index];
      cond.operator = operator;
      this.fitLiteral(cond);
    });
  }

  /**
   * Picks the tested field. The compared value stays when the new question has the same type,
   * except for choice questions, whose option ids belong to the question they were picked
   * from. Otherwise it is cleared, never converted. The operator stays when it fits the new
   * field's type, else it falls back to `eq`.
   */
  setField(index: number, fieldId: string, fieldType: ElementType): void {
    const old = this.source().conditions[index];
    if (old?.fieldId === fieldId) return;
    const oldType = this.fieldOf(old)?.type ?? old?.fieldType;
    const keep = oldType === fieldType && !CHOICE_TYPES.has(fieldType);
    this.mutate((g) => {
      if (keep) {
        Object.assign(g.conditions[index], { fieldId, fieldType });
        return;
      }
      const { operator } = g.conditions[index];
      const cond: Condition = { ...emptyCondition(), fieldId, fieldType };
      if (conditionOperatorsFor(fieldType).includes(operator)) cond.operator = operator;
      this.fitLiteral(cond);
      g.conditions[index] = cond;
    });
  }

  /**
   * Puts a literal operand in the shape its operator and field need: a list for `in` /
   * `notIn` and multi-choice questions, else a single value (the first of a former list).
   */
  private fitLiteral(cond: Condition): void {
    const operand = cond.operand;
    if (operand?.kind !== 'literal') return;
    const list =
      NEEDS_RIGHT[cond.operator] === 'list' || this.fieldOf(cond)?.type === 'multiChoice';
    const value = operand.value;
    if (list && !Array.isArray(value)) operand.value = value === null ? [] : [value];
    if (!list && Array.isArray(value)) operand.value = value[0] ?? null;
  }

  /** Stores a literal entered with the tested field's control (a list for multi-choice). */
  setLiteral(index: number, which: 'operand' | 'operandTo', value: FieldValue): void {
    const literal = toLiteral(value);
    this.mutate((g) => {
      g.conditions[index][which] = { kind: 'literal', value: literal };
    });
  }

  /** The element a condition tests; its type picks the control for literal operands. */
  fieldOf(cond: Condition): ElementDefinition | null {
    return (cond.fieldId && this.form().elements[cond.fieldId]) || null;
  }

  /** The choice question a condition tests, if any; its literals are option ids. */
  choiceOf(cond: Condition): ChoiceElement | null {
    const el = this.fieldOf(cond);
    return el && isChoice(el) ? el : null;
  }

  setOptionList(index: number, value: string | string[] | null): void {
    this.setListLiteral(index, Array.isArray(value) ? value : value ? [value] : []);
  }

  setOperandKind(index: number, kind: 'literal' | 'field'): void {
    this.mutate((g) => {
      const cond = g.conditions[index];
      if (kind === 'literal') {
        cond.operand = { kind: 'literal', value: null };
      } else {
        cond.operand = { kind: 'field', fieldId: '' };
      }
    });
  }

  /**
   * Stores a comma-separated list literal. Entries are only converted to numbers or booleans
   * where the tested question holds them, so e.g. `001` stays text for a text question.
   */
  setList(index: number, raw: string): void {
    const kind = valueKindOf(this.fieldOf(this.source().conditions[index]));
    this.setListLiteral(
      index,
      raw
        .split(',')
        .map((s) => parseRaw(kind, s.trim()))
        .filter((v): v is LiteralValue => isLiteralValue(v) && v !== ''),
    );
  }

  private setListLiteral(index: number, value: LiteralValue[]): void {
    this.mutate((g) => {
      g.conditions[index].operand = { kind: 'literal', value };
    });
  }

  addCond(): void {
    this.mutate((g) => g.conditions.push(emptyCondition()));
  }

  removeCond(index: number): void {
    this.mutate((g) => g.conditions.splice(index, 1));
  }

  addGroup(): void {
    this.mutate((g) => g.groups.push({ logic: 'all', conditions: [], groups: [] }));
  }

  removeGroup(index: number): void {
    this.mutate((g) => g.groups.splice(index, 1));
  }

  setGroup(index: number, group: ConditionGroup): void {
    this.mutate((g) => {
      g.groups = g.groups.map((gr, i) => (i === index ? group : gr));
    });
  }

  private mutate(fn: (g: ConditionGroup) => void): void {
    const next = cloneGroup(this.source());
    fn(next);
    this.source.set(next);
    this.changed.emit(next);
  }
}

function isLiteralValue(v: unknown): v is LiteralValue {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

/** A value as a condition literal: a single value or a list of them, else none (e.g. files). */
function toLiteral(value: FieldValue): LiteralOperand['value'] {
  if (isLiteralValue(value)) return value;
  if (!Array.isArray(value)) return null;
  const items: unknown[] = value;
  return items.every(isLiteralValue) ? items : null;
}

function cloneGroup(g: ConditionGroup): ConditionGroup {
  return JSON.parse(JSON.stringify(g)) as ConditionGroup;
}
