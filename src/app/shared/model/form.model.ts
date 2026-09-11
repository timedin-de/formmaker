import type { ElementId, FormId, PageId } from './ids';
import type { ConditionGroup } from './conditions.model';
import type { FieldValue } from './values.model';
import type { ValidationRule } from './validation.model';
import { ElementViewRef } from '../../core';

export const QUESTION_TYPES = [
  'text',
  'longText',
  'number',
  'date',
  'time',
  'dateTime',
  'boolean',
  'choice',
  'dropdown',
  'multiChoice',
  'scale',
  'file',
  'signature',
] as const;

export const ELEMENT_TYPES = [...QUESTION_TYPES, 'group', 'section', 'textdisplay'] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];
export type ElementType = (typeof ELEMENT_TYPES)[number];

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
  | { kind: 'fromField'; fieldId: ElementId };

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
  width?: number;
  enabledWhen?: ConditionGroup;
}

interface QuestionAttributes {
  type: QuestionType;
  placeholder?: string;
  defaultValue?: DefaultValueDef;
  required?: boolean;
  validations?: ValidationRule[];
  readonly?: boolean;
}

export interface ExtendedElementBase extends ElementBase {
  placeholder?: undefined;
  defaultValue?: undefined;
  required?: undefined;
  validations?: undefined;
  readonly?: undefined;
}

export type QuestionBase = ElementBase & QuestionAttributes;

export interface ChoiceOption {
  id: string;
  label: string;
  value: string | number;
}

export interface ChoiceElement extends QuestionBase {
  type: 'choice' | 'dropdown' | 'multiChoice';
  options: ChoiceOption[];
}

export interface ScalarElement extends QuestionBase {
  type: Exclude<QuestionType, 'choice' | 'dropdown' | 'multiChoice' | 'file' | 'signature'>;
}

export interface NumberElement extends QuestionBase {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** If set, the field is read-only and reflects a computed result. */
  calculation?: Calculation;
  decimals?: number;
}

export interface ScaleElement extends QuestionBase {
  type: 'scale';
  min: number;
  max: number;
  step: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface FileElement extends QuestionBase {
  type: 'file';
  accept?: string;
  multiple?: boolean;
}

export interface SignatureElement extends QuestionBase {
  type: 'signature';
}

export interface BooleanElement extends QuestionBase {
  type: 'boolean';
}

export interface DateElement extends QuestionBase {
  type: 'date' | 'time' | 'dateTime';
}

export interface TextElement extends QuestionBase {
  type: 'text';
  inputType?: 'text' | 'email' | 'url' | 'phone' | 'number';
  maxLength?: number;
}

export interface LongTextElement extends QuestionBase {
  type: 'longText';
  rows?: number;
  maxLength?: number;
}

export interface GroupElement extends ExtendedElementBase {
  type: 'group';
  legend?: string;
  elements: Elements;
  elementsRef?: ElementViewRef[];
  collapsible?: boolean;
}

export interface SectionElement extends ExtendedElementBase {
  type: 'section';
  heading: string;
}

export interface TextDisplayElement extends ExtendedElementBase {
  type: 'textdisplay';
}
export type QuestionDefinition =
  | TextElement
  | LongTextElement
  | NumberElement
  | DateElement
  | BooleanElement
  | ChoiceElement
  | ScaleElement
  | FileElement
  | SignatureElement;

export type ElementDefinition =
  QuestionDefinition | GroupElement | SectionElement | TextDisplayElement;

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
