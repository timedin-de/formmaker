import { type QuestionType } from './form.model';

/**
 * Validation rules. `customExpression` runs through the expression engine
 * against the current values and must evaluate to a truthy value (or string
 * error message) to pass.
 */
export const VALIDATION_RULE_TYPES = [
  'required',
  'minLength',
  'maxLength',
  'minCount',
  'maxCount',
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

const defaultValidation: readonly ValidationRuleType[] = ['required', 'custom'];
const textValidation: readonly ValidationRuleType[] = [
  ...defaultValidation,
  'minLength',
  'maxLength',
  'pattern',
  'email',
  'url',
  'phone',
  'integer',
  'number',
];
const dateValidation: readonly ValidationRuleType[] = [...defaultValidation, 'dateMin', 'dateMax'];

/** Rules the designer offers per question type. Rules that can repeat are in `REPEATABLE_RULES`. */
export const ValidationsByQuestionType: Readonly<
  Record<QuestionType, readonly ValidationRuleType[]>
> = {
  text: textValidation,
  longText: textValidation,
  number: [...defaultValidation, 'min', 'max', 'between', 'integer'],
  boolean: defaultValidation,
  date: dateValidation,
  time: defaultValidation,
  dateTime: dateValidation,
  choice: defaultValidation,
  dropdown: defaultValidation,
  // minCount / maxCount count the selected options.
  multiChoice: [...defaultValidation, 'minCount', 'maxCount'],
  scale: defaultValidation,
  file: [...defaultValidation, 'minFiles', 'maxFiles', 'fileSizeMaxMb', 'fileType'],
  signature: defaultValidation,
};

/** Rules that make sense more than once on the same question. */
export const REPEATABLE_RULES: readonly ValidationRuleType[] = ['pattern', 'custom'];

export interface ValidationRule {
  id: string;
  rule: ValidationRuleType;
  /** Piped-text can be referenced in messages via {{fieldId}}. */
  message: string;
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
