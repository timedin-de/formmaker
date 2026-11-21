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
import type { ChoiceElement, ElementDefinition } from '@shared/model/form.model';
import type {
  Condition,
  ConditionGroup,
  ConditionOperand,
  ConditionOperator,
  LiteralOperand,
} from '@shared/model/conditions.model';
import { CONDITION_OPERATORS, emptyCondition } from '@shared/model/conditions.model';
import { I18nService } from '../core/i18n';
import { OptionPicker } from './option-picker';
import { QuestionInputField } from './question-input-field';
import { QuestionSelector } from './question-selector';

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
  hasAnyOf: 'list',
  hasAllOf: 'list',
  between: 'range',
};

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

  readonly OPERATORS = CONDITION_OPERATORS;

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

  listText(cond: Condition): string {
    return (cond.values ?? []).map(String).join(', ');
  }

  setLogic(logic: 'all' | 'any'): void {
    this.mutate((g) => (g.logic = logic));
  }

  set(index: number, patch: Partial<Condition>): void {
    this.mutate((g) => Object.assign(g.conditions[index], patch));
  }

  /** Stores a literal entered with the tested field's control (a single value, never a list). */
  setLiteral(index: number, which: 'operand' | 'operandTo', value: FieldValue): void {
    const literal =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : null;
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
    this.mutate((g) => {
      g.conditions[index].values = Array.isArray(value) ? value : value ? [value] : [];
    });
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

  setList(index: number, raw: string): void {
    this.mutate((g) => {
      g.conditions[index].values = raw
        .split(',')
        .map((s) => parseLiteral(s.trim()))
        .filter((v): v is string | number | boolean => v !== null && v !== '');
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

function parseLiteral(raw: string): string | number | boolean | null {
  if (raw === '') return null;
  const nr = Number(raw);
  if (raw !== '' && !Number.isNaN(nr) && /^-?\d*\.?\d+$/.test(raw)) return nr;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

function cloneGroup(g: ConditionGroup): ConditionGroup {
  return JSON.parse(JSON.stringify(g)) as ConditionGroup;
}
