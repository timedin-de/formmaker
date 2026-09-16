import { ElementType } from './form.model';
import type { ElementId } from './ids';

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'in'
  | 'notIn'
  | 'hasAnyOf'
  | 'hasAllOf'
  | 'between';

export interface LiteralOperand {
  kind: 'literal';
  value: string | number | boolean | null;
}

export interface FieldOperand {
  kind: 'field';
  /** Reference to another element whose current value is compared. */
  fieldId: ElementId;
}

export type ConditionOperand = LiteralOperand | FieldOperand;

export interface Condition {
  /**
   * The field being evaluated (question id, `group` id, or page gate id).
   * Empty string means "unset" (editor placeholder).
   */
  fieldId: ElementId | '';
  fieldType?: ElementType;
  operator: ConditionOperator;
  /** Right side of binary operators (eq/neq/gt/.../between-with-single-value). */
  operand?: ConditionOperand;
  /** Upper bound for `between`. */
  operandTo?: ConditionOperand;
  /** For `in` / `notIn` / `hasAnyOf` / `hasAllOf`. */
  values?: (string | number | boolean)[];
}

export interface ConditionGroup {
  /** `all` = AND, `any` = OR. */
  logic: 'all' | 'any';
  conditions: Condition[];
  groups: ConditionGroup[];
}

export const EMPTY_CONDITION_GROUP: ConditionGroup = {
  logic: 'all',
  conditions: [],
  groups: [],
};

export const CONDITION_OPERATORS: ConditionOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'isEmpty',
  'isNotEmpty',
  'in',
  'notIn',
  'hasAnyOf',
  'hasAllOf',
  'between',
];

export function emptyCondition(): Condition {
  return { fieldId: '', operator: 'eq', operand: { kind: 'literal', value: null } };
}

export function emptyConditionGroup(): ConditionGroup {
  return { logic: 'all', conditions: [], groups: [] };
}
