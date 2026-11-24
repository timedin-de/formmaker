import { type TranslationKey } from '../../frontend/app/core/i18n';
import type { ConditionGroup } from './conditions.model';
import type { ElementId, FormId, PageId } from './ids';
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
}

export interface ChoiceElement extends QuestionBase {
  type: 'choice' | 'dropdown' | 'multiChoice';
  options: ChoiceOption[];
}

export interface NumberElement extends QuestionBase, Placeholderable {
  type: 'number';
  step?: number;
  unit?: string;
  decimals?: number;
}

export interface ScaleElement extends QuestionBase {
  type: 'scale';
  min: number;
  max: number;
  step: number;
  minLabel: string;
  maxLabel: string;
}

/** Most values a scale question may offer (0–10); larger scales are rejected when saved. */
export const MAX_SCALE_STEPS = 11;

/**
 * The values a scale offers from `min` up to `max` in `step`s (rounded to 2 decimals), or `null`
 * when that is not 1 to `MAX_SCALE_STEPS` values or a step leaves the value unchanged.
 */
export function scaleValues({
  min,
  max,
  step,
}: Pick<ScaleElement, 'min' | 'max' | 'step'>): number[] | null {
  if (!(step > 0) || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  const values: number[] = [];
  // Each value is computed from `min`, so float errors don't add up; the loop ends after at
  // most MAX_SCALE_STEPS + 1 rounds.
  for (let i = 0; ; i++) {
    const raw = min + i * step;
    if (raw > max + step * 1e-9) break;
    const value = Math.round(raw * 100) / 100;
    if (value === values.at(-1) || values.length === MAX_SCALE_STEPS) return null;
    values.push(value);
  }
  return values.length ? values : null;
}

/** Number of values a scale offers; `Infinity` when it has no valid set of values. */
export function scaleStepCount(scale: Pick<ScaleElement, 'min' | 'max' | 'step'>): number {
  return scaleValues(scale)?.length ?? Infinity;
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
  type: 'date';
}

// ---------------------------------------------------------------------------
// Time interval
// ---------------------------------------------------------------------------
export const TIME_INTERVAL_UNITS = [
  { multiplier: '1', key: 'panel.timeInterval.unit.second' },
  { multiplier: '60', key: 'panel.timeInterval.unit.minute' },
  { multiplier: '3600', key: 'panel.timeInterval.unit.hour' },
] as const satisfies readonly { multiplier: TimeInterval['multiplier']; key: TranslationKey }[];

/** Unit factors a time interval can be expressed in. */
export const TIME_INTERVAL_MULTIPLIERS = ['1', '60', '3600'] as const;

export type TimeIntervalMultiplier = (typeof TIME_INTERVAL_MULTIPLIERS)[number];

/** Granularity of a time picker: selectable times are `value` × `multiplier` apart. */
export interface TimeInterval {
  value: number;
  multiplier: TimeIntervalMultiplier;
}

export const DEFAULT_TIME_INTERVAL: TimeInterval = { value: 1, multiplier: '60' };

export interface TimeElement extends QuestionBase, Placeholderable {
  type: 'time' | 'dateTime';
  timeInterval: TimeInterval;
}

export interface TextElement extends QuestionBase, Placeholderable {
  type: 'text';
  inputType?: 'text' | 'email' | 'url' | 'phone' | 'number';
}

export interface LongTextElement extends QuestionBase, Placeholderable {
  type: 'longText';
  rows?: number;
}

export interface GroupElement extends ElementBase, DefaultValueable {
  type: 'group';
  /** Ids of the child elements, in order; the elements live in `FormDefinition.elements`. */
  children: ElementId[];
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
  | TimeElement
  | BooleanElement
  | ChoiceElement
  | ScaleElement
  | FileElement
  | SignatureElement;

export type ElementDefinition =
  QuestionDefinition | GroupElement | SectionElement | TextDisplayElement;

export type Elements = ElementDefinition[];

/** Every element of a form, keyed by its id. */
export type FormElements = Record<ElementId, ElementDefinition>;

// ---------------------------------------------------------------------------
// Pages & form
// ---------------------------------------------------------------------------

/**
 * Version of the stored form document layout.
 * 1: children nested inline (`page.elements`, `group.elements`).
 * 2: elements in a flat `elements` map, pages and groups hold `children` ids.
 */
export const FORM_SCHEMA_VERSION = 2;

export interface PageDefinition {
  id: PageId;
  title: string;
  subtitle: string;
  /**
   * Page-based condition. An empty/falsy group means the page is always in the
   * flow. If a page becomes inactive, the navigation skips it automatically —
   * page logic without scripting.
   */
  enabledWhen?: ConditionGroup;
  /** Ids of the root elements of the page, in order. */
  children: ElementId[];
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

export interface SaveFormDefinition {
  id: FormId;
  name?: string;
  ownerId?: string;
  owner?: PublicUser | null;
  description?: string;
  settings: FormSettings;
  pages: PageDefinition[];
  /**
   * Every element of the form. Pages and groups list their children by id;
   * each element is listed by exactly one page or group.
   */
  elements: FormElements;
}

export interface FormDefinition extends SaveFormDefinition {
  readonly id: FormId;
  name?: string;
  readonly ownerId?: string;
  readonly owner?: PublicUser | null;
  description?: string;
  readonly version: number;
  readonly schemaVersion: typeof FORM_SCHEMA_VERSION;
  readonly createdAt: string;
  readonly updatedAt: string;
  settings: FormSettings;
  pages: PageDefinition[];
  elements: FormElements;
}

export interface NamedFormDefinition extends FormDefinition {
  name: string;
}

export type PortableFormDefinition<T extends FormDefinition | SaveFormDefinition> = Omit<
  T,
  'ownerId' | 'owner'
>;

export interface FormWithOwner extends FormDefinition {
  ownerId: string;
  owner: PublicUser | null;
}

export function toPortableForm<T extends FormDefinition | SaveFormDefinition>(
  form: T,
): PortableFormDefinition<T> {
  const { ownerId: _ownerId, owner: _owner, ...portable } = form;
  return portable;
}
