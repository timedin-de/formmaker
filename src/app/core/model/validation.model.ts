/**
 * Validation rules. `customExpression` runs through the expression engine
 * against the current values and must evaluate to a truthy value (or string
 * error message) to pass.
 */
export type ValidationRuleType =
  | 'required'
  | 'minLength'
  | 'maxLength'
  | 'min'
  | 'max'
  | 'between'
  | 'pattern'
  | 'email'
  | 'url'
  | 'phone'
  | 'integer'
  | 'number'
  | 'dateMin'
  | 'dateMax'
  | 'minFiles'
  | 'maxFiles'
  | 'fileSizeMaxMb'
  | 'fileType'
  | 'custom';

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
  return { id: crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2), rule };
}

export const VALIDATION_RULE_TYPES: { type: ValidationRuleType; label: string }[] = [
  { type: 'required', label: 'Required' },
  { type: 'minLength', label: 'Min length' },
  { type: 'maxLength', label: 'Max length' },
  { type: 'min', label: 'Min numeric value' },
  { type: 'max', label: 'Max numeric value' },
  { type: 'between', label: 'Between numeric range' },
  { type: 'pattern', label: 'Regex pattern' },
  { type: 'email', label: 'Email' },
  { type: 'url', label: 'URL' },
  { type: 'phone', label: 'Phone number' },
  { type: 'integer', label: 'Integer' },
  { type: 'number', label: 'Number' },
  { type: 'dateMin', label: 'Date after / at' },
  { type: 'dateMax', label: 'Date before / at' },
  { type: 'minFiles', label: 'Min files' },
  { type: 'maxFiles', label: 'Max files' },
  { type: 'fileSizeMaxMb', label: 'Max file size (MB)' },
  { type: 'fileType', label: 'Allowed file types' },
  { type: 'custom', label: 'Custom expression' },
];
