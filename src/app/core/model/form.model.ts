import type { ElementId, FormId, PageId } from './ids';
import type { ConditionGroup } from './conditions.model';
import type { FieldValue } from './values.model';
import type { ValidationRule } from './validation.model';

export type QuestionType =
  | 'text'
  | 'longText'
  | 'number'
  | 'date'
  | 'time'
  | 'dateTime'
  | 'boolean'
  | 'choice'
  | 'dropdown'
  | 'multiChoice'
  | 'scale'
  | 'file'
  | 'signature';

export type ElementType = QuestionType | 'group' | 'section';

// ---------------------------------------------------------------------------
// Default / predefined values
// ---------------------------------------------------------------------------

export type DefaultValueDef =
  | { kind: 'static'; value: FieldValue }
  /**
   * Computed at render/evaluation time from the expression engine.
   * E.g. `concat('Order #', upper(q_invoice_id))` or `now()`.
   */
  | { kind: 'expression'; expression: string }
  /** Copy the value of another field, optionally transformed. */
  | { kind: 'fromField'; fieldId: ElementId; transform?: 'identity' | 'upper' | 'lower' };

// ---------------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------------

export interface Calculation {
  /** Arithmetic expression, e.g. `(n_price * n_qty) * (1 - n_discount / 100)`. */
  formula: string;
  /** Optional number of decimals to round to. */
  decimals?: number;
  /** Explicit dependency list; if empty, dependencies are parsed from the formula. */
  triggeredBy?: ElementId[];
}

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

export interface ElementBase {
  id: ElementId;
  type: ElementType;
  /** Supports piping: segments like {{otherFieldId}} are substituted. */
  label: string;
  description?: string;
  placeholder?: string;
  readonly?: boolean;
  /** Conditional (question/group based) visibility. Empty group = always visible. */
  enabledWhen?: ConditionGroup;
  /** Static mandatory flag (rendered as rule) — sets a `required` validation preemptively. */
  required?: boolean;
  validations?: ValidationRule[];
  /** Static or dynamic predefined value. */
  defaultValue?: DefaultValueDef;
  /** Width factor within the row: 1 = full, 0.5 = half, 0.33 = third, etc. */
  width?: number | 'full' | 'half' | 'third';
}

export interface ChoiceOption {
  id: string;
  label: string;
  value: string | number;
  enabledWhen?: ConditionGroup;
}

export interface ChoiceElement extends ElementBase {
  type: 'choice' | 'dropdown' | 'multiChoice';
  options: ChoiceOption[];
}

export interface ScalarElement extends ElementBase {
  type: Exclude<QuestionType, 'choice' | 'dropdown' | 'multiChoice' | 'file' | 'signature'>;
}

export interface NumberElement extends ElementBase {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** If set, the field is read-only and reflects a computed result. */
  calculation?: Calculation;
  decimals?: number;
}

export interface ScaleElement extends ElementBase {
  type: 'scale';
  min: number;
  max: number;
  step: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface FileElement extends ElementBase {
  type: 'file';
  accept?: string;
  multiple?: boolean;
}

export interface SignatureElement extends ElementBase {
  type: 'signature';
}

export interface BooleanElement extends ElementBase {
  type: 'boolean';
}

export interface DateElement extends ElementBase {
  type: 'date' | 'time' | 'dateTime';
}

export interface TextElement extends ElementBase {
  type: 'text';
  inputType?: 'text' | 'email' | 'url' | 'phone' | 'number';
  maxLength?: number;
}

export interface LongTextElement extends ElementBase {
  type: 'longText';
  rows?: number;
  maxLength?: number;
}

export interface GroupElement extends ElementBase {
  type: 'group';
  legend?: string;
  elements: Elements;
  collapsible?: boolean;
}

export interface SectionElement extends ElementBase {
  type: 'section';
  heading: string;
}

export type ElementDefinition =
  | TextElement
  | LongTextElement
  | NumberElement
  | DateElement
  | BooleanElement
  | ChoiceElement
  | ScaleElement
  | FileElement
  | SignatureElement
  | GroupElement
  | SectionElement;

export type Elements = ElementDefinition[];

// ---------------------------------------------------------------------------
// Pages & form
// ---------------------------------------------------------------------------

export interface PageDefinition {
  id: PageId;
  title?: string;
  subtitle?: string;
  /**
   * Page-based condition. An empty/falsy group means the page is always in the
   * flow. If a page becomes inactive, the navigation skips it automatically —
   * page logic without scripting.
   */
  enabledWhen?: ConditionGroup;
  elements: Elements;
}

export interface FormSettings {
  name?: string;
  submitLabel?: string;
  showProgress?: boolean;
  allowBack?: boolean;
  /** linear = pages strictly follow order, free = jump via progress, auto = skip gated pages. */
  navigation: 'linear' | 'free' | 'auto';
  enableAutoSave?: boolean;
}

export interface FormDefinition {
  id: FormId;
  name: string;
  description?: string;
  version: number;
  schemaVersion: 1;
  createdAt?: string;
  updatedAt?: string;
  settings: FormSettings;
  pages: PageDefinition[];
}
