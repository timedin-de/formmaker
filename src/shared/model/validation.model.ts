import { uuid } from './ids';

/**
 * Validation rules. `customExpression` runs through the expression engine
 * against the current values and must evaluate to a truthy value (or string
 * error message) to pass.
 */
export const VALIDATION_RULE_TYPES = [
  'required',
  'minLength',
  'maxLength',
  'min',
  'max',
  'between',
  'pattern',
  'email',
  'url',
  'phone',
  'integer',
  'number',
  'dateMin',
  'dateMax',
  'minFiles',
  'maxFiles',
  'fileSizeMaxMb',
  'fileType',
  'custom',
] as const;

export type ValidationRuleType = (typeof VALIDATION_RULE_TYPES)[number];

export interface ValidationRule {
  id: string;
  rule: ValidationRuleType;
  /** Piped-text can be referenced in messages via {{fieldId}}. */
  message?: string;
  value?: unknown;
  valueTo?: unknown;
  /** regex source for `pattern`. */
  pattern?: string;
  /**
   * Expression for `custom`. Evaluated against values; may be a boolean
   * expression or a `msg("text")` helper returning the failure message.
   */
  expression?: string;
  /** for fileType — comma-separated extensions or MIME types. */
  accept?: string;
}

export function validationRule(rule: ValidationRuleType): ValidationRule {
  return { id: uuid(), rule };
}
