import { FormControl } from '@angular/forms';
import type { ConditionGroup } from './conditions.model';
import type { ElementId, FormId, PageId } from './ids';
import { Submission } from './submission.model';
import type { PublicUser } from './user.model';
import type { ValidationRule } from './validation.model';
import type { FieldValue } from './values.model';

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
// Elements
// ---------------------------------------------------------------------------

export interface ElementBase {
  id: ElementId;
  type: ElementType;
  /** Supports piping: segments like {{otherFieldId}} are substituted. */
  label: string;
  description: string | undefined;
  width: number;
  enabledWhen?: ConditionGroup;
}

// Question Parts

interface QuestionAttributes extends DefaultValueable {
  type: QuestionType;
  required: boolean;
  validations: ValidationRule[];
  readonly: boolean;
}

interface Placeholderable {
  placeholder: string;
}

interface DefaultValueable {
  defaultValue: DefaultValueDef | null;
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

export interface NumberElement extends QuestionBase, Placeholderable {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
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

export interface DateElement extends QuestionBase, Placeholderable {
  type: 'date' | 'time' | 'dateTime';
}

export interface TextElement extends QuestionBase, Placeholderable {
  type: 'text';
  inputType?: 'text' | 'email' | 'url' | 'phone' | 'number';
  maxLength?: number;
}

export interface LongTextElement extends QuestionBase, Placeholderable {
  type: 'longText';
  rows?: number;
  maxLength?: number;
}

export interface GroupElement extends ElementBase, DefaultValueable {
  type: 'group';
  elements: Elements;
  elementsRef?: ElementViewRef[];
  collapsible: boolean;
}

export interface SectionElement extends ElementBase {
  type: 'section';
}

export interface TextDisplayElement extends ElementBase {
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
  ownerId?: string;
  owner?: PublicUser | null;
  description?: string;
  version: number;
  schemaVersion: 1;
  createdAt?: string;
  updatedAt?: string;
  settings: FormSettings;
  pages: PageDefinition[];
}

export type PortableFormDefinition = Omit<FormDefinition, 'ownerId' | 'owner'>;

export interface FormWithOwner extends FormDefinition {
  ownerId: string;
  owner: PublicUser | null;
}

export function toPortableForm(form: FormDefinition): PortableFormDefinition {
  const { ownerId: _ownerId, owner: _owner, ...portable } = form;
  return portable;
}

export interface RunnerPage {
  id: string;
  title: string;
  subtitle: string;
  index: number;
  visible: boolean;
  elements: ElementViewRef[];
}

export interface ElementViewRef {
  id: string;
  el: ElementDefinition;
  label: string;
  description: string;
  visible: boolean;
  placeholder?: string;
  control: FormControl;
}

export interface SubmissionResult {
  submission: Submission;
  visibleAnswerKeys: string[];
}
