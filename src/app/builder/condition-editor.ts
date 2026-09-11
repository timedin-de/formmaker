import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  ConditionGroup,
  Condition,
  ConditionOperator,
  ConditionOperand,
} from '../core/model/conditions.model';
import { CONDITION_OPERATORS } from '../core/model/conditions.model';
import { emptyCondition } from '../core/model/conditions.model';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: 'equals',
  neq: 'does not equal',
  gt: 'is greater than',
  gte: 'is greater or equal',
  lt: 'is less than',
  lte: 'is less or equal',
  contains: 'contains',
  notContains: 'does not contain',
  startsWith: 'starts with',
  endsWith: 'ends with',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
  in: 'is one of',
  notIn: 'is none of',
  hasAnyOf: 'has any of',
  hasAllOf: 'has all of',
  between: 'is between',
};

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
  ],
  selector: 'fm-condition-editor',
  templateUrl: './condition-editor.html',
  styleUrl: './condition-editor.scss',
})
export class ConditionEditor {
  readonly group = input<ConditionGroup>({ logic: 'all', conditions: [], groups: [] });
  readonly fields = input<ConditionFieldOption[]>([]);
  readonly legend = input<string>('When');
  readonly indent = input(false);
  readonly changed = output<ConditionGroup>();

  readonly OPERATORS = CONDITION_OPERATORS;
  readonly OPERATOR_LABELS = OPERATOR_LABELS;

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

  literalText(cond: Condition): string {
    const value = cond.operand?.kind === 'literal' ? cond.operand.value : null;
    if (value === null || value === undefined) return '';
    return String(value);
  }

  rangeToText(cond: Condition): string {
    const value = cond.operandTo?.kind === 'literal' ? cond.operandTo.value : null;
    if (value === null || value === undefined) return '';
    return String(value);
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

  set$(index: number, which: 'operand', raw: string): void {
    this.mutate((g) => {
      g.conditions[index].operand = { kind: 'literal', value: parseLiteral(raw) };
    });
  }

  setOperandKind(index: number, kind: 'literal' | 'field'): void {
    this.mutate((g) => {
      const cond = g.conditions[index];
      if (kind === 'literal') {
        cond.operand = { kind: 'literal', value: null };
      } else {
        cond.operand = { kind: 'field', fieldId: this.fields()[0]?.id ?? '' };
      }
    });
  }

  setRangeTo(index: number, raw: string): void {
    this.mutate((g) => {
      g.conditions[index].operandTo = {
        kind: 'literal',
        value: raw.trim() === '' ? null : parseLiteral(raw),
      };
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
