import type {
  Condition,
  ConditionGroup,
  ConditionOperand,
  LiteralValue,
} from '@shared/model/conditions.model';
import type { FieldValue } from '@shared/model/values.model';
import { isEmptyValue } from './expression/evaluator';

type ConditionValues = Readonly<Record<string, FieldValue | undefined>>;
/** A side of a condition: an answer, or a literal (a list for `in` / multi-choice). */
type Side = FieldValue | LiteralValue[];

export function evalCondition(condition: Condition, values: ConditionValues): boolean {
  const { fieldId } = condition;
  if (!fieldId) return true; // unset row — treat as satisfied (editor-safe default)
  const left = values[fieldId] ?? null;
  const right = resolveOperand(condition.operand, values);

  switch (condition.operator) {
    case 'isEmpty':
      return isEmptyValue(left as never);
    case 'isNotEmpty':
      return !isEmptyValue(left as never);
    case 'eq':
      // A list (multi-choice) equals exactly the same items, in any order.
      if (Array.isArray(left) || Array.isArray(right))
        return sameItems(asList(left), asList(right));
      return equals(left, right);
    case 'neq':
      return !evalCondition({ ...condition, operator: 'eq' }, values);
    case 'gt':
      return numericCompare(left, right) === 1;
    case 'gte':
      return numericCompare(left, right) >= 0;
    case 'lt':
      return numericCompare(left, right) === -1;
    case 'lte':
      return numericCompare(left, right) <= 0;
    case 'contains':
      // A list operand: every one of its items is among the answer's items.
      if (Array.isArray(right)) return right.every((v) => includes(asList(left), v));
      if (Array.isArray(left)) return left.some((item) => contains(stringify(item), right));
      return contains(left, right);
    case 'notContains':
      return !evalCondition({ ...condition, operator: 'contains' }, values);
    case 'startsWith':
      return left != null && String(left).startsWith(String(right ?? ''));
    case 'endsWith':
      return left != null && String(left).endsWith(String(right ?? ''));
    case 'in':
      // Any item of the answer (a single value is one item) is among the operand's items.
      return asList(left).some((item) => includes(asList(right), item));
    case 'notIn':
      return !evalCondition({ ...condition, operator: 'in' }, values);
    case 'between': {
      const to = resolveOperand(condition.operandTo, values);
      return numericCompare(left, right) >= 0 && numericCompare(left, to) <= 0;
    }
    default:
      return false;
  }
}

export function evalConditionGroup(
  group: ConditionGroup | undefined | null,
  values: ConditionValues,
): boolean {
  if (!group) return true;
  const results: boolean[] = [];
  for (const condition of group.conditions) {
    results.push(evalCondition(condition, values));
  }
  for (const nested of group.groups) {
    results.push(evalConditionGroup(nested, values));
  }
  if (results.length === 0) return true;
  return group.logic === 'any' ? results.some((r) => r) : results.every((r) => r);
}

function resolveOperand(operand: ConditionOperand | undefined, values: ConditionValues): Side {
  if (!operand) return null;
  if (operand.kind === 'field') return values[operand.fieldId] ?? null;
  return operand.value;
}

function equals(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === null && b === null;
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function numericCompare(a: Side, b: Side): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb ? 0 : na < nb ? -1 : 1;
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  return sa === sb ? 0 : sa < sb ? -1 : 1;
}

function contains(a: Side, b: Side): boolean {
  if (a === null || b === null) return false;
  return stringify(a).toLowerCase().includes(stringify(b).toLowerCase());
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.map(stringify).join(', ');
    return '';
  }
  return String(value);
}

function includes(list: readonly unknown[], v: unknown): boolean {
  return list.some((item) => equals(item, v));
}

/** Same items regardless of order (and of duplicates). */
function sameItems(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.every((v) => includes(b, v)) && b.every((v) => includes(a, v));
}

function asList(a: Side): readonly unknown[] {
  if (Array.isArray(a)) return a;
  return a === null || a === undefined ? [] : [a];
}

/** Field ids referenced by a condition group (both sides of operands). */
export function conditionGroupReferences(group: ConditionGroup | undefined | null): string[] {
  if (!group) return [];
  const refs = new Set<string>();
  const visit = (g: ConditionGroup) => {
    for (const c of g.conditions) {
      if (c.fieldId) refs.add(c.fieldId);
      if (c.operand?.kind === 'field') refs.add(c.operand.fieldId);
      if (c.operandTo?.kind === 'field') refs.add(c.operandTo.fieldId);
    }
    g.groups.forEach(visit);
  };
  visit(group);
  return [...refs];
}
