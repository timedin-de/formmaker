import { type ElementType } from './form.model';
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
  | 'between';

export type LiteralValue = string | number | boolean;

export interface LiteralOperand {
  kind: 'literal';
  /**
   * A list for `in` / `notIn` (any of its items), and for a multi-choice question, whose
   * answer is a list of option ids (`eq`: exactly these, `contains`: all of these).
   */
  value: LiteralValue | LiteralValue[] | null;
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
  /** Right side of every operator but `isEmpty` / `isNotEmpty`; the lower bound of `between`. */
  operand?: ConditionOperand;
  /** Upper bound for `between`. */
  operandTo?: ConditionOperand;
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
  'between',
];

/** A multi-choice answer is an unordered set of option ids. */
const MULTI_CHOICE_OPERATORS: ConditionOperator[] = [
  'eq',
  'neq',
  'contains',
  'notContains',
  'in',
  'notIn',
  'isEmpty',
  'isNotEmpty',
];

/** A choice / dropdown answer is one option id: no text matching or ordering. */
const CHOICE_OPERATORS: ConditionOperator[] = ['eq', 'neq', 'in', 'notIn', 'isEmpty', 'isNotEmpty'];

/** The operators that make sense for a field of `type`; every operator when it is unknown. */
export function conditionOperatorsFor(type: ElementType | undefined): ConditionOperator[] {
  switch (type) {
    case 'multiChoice':
      return MULTI_CHOICE_OPERATORS;
    case 'choice':
    case 'dropdown':
      return CHOICE_OPERATORS;
    default:
      return CONDITION_OPERATORS;
  }
}

export function emptyCondition(): Condition {
  return { fieldId: '', operator: 'eq', operand: { kind: 'literal', value: null } };
}

export function emptyConditionGroup(): ConditionGroup {
  return { logic: 'all', conditions: [], groups: [] };
}
