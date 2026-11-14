import * as z from 'zod/mini';
import {
  type BooleanElement,
  type ChoiceElement,
  type ChoiceOption,
  type DateElement,
  DEFAULT_TIME_INTERVAL,
  ELEMENT_TYPES,
  type ElementBase,
  type ElementDefinition,
  type ElementPatch,
  type FileElement,
  type FormElements,
  type GroupElement,
  type LongTextElement,
  type NumberElement,
  QUESTION_TYPES,
  type QuestionBase,
  type QuestionDefinition,
  type ScaleElement,
  type SectionElement,
  type SignatureElement,
  type TextDisplayElement,
  type TextElement,
  TIME_INTERVAL_MULTIPLIERS,
  type TimeElement,
  type TimeInterval,
} from '../model';
import { conditionGroupSchema } from './conditions';
import { defaultValueableSchema, defaultValueDefSchema } from './defaultValue';
import { validationRuleSchema } from './validations';

const elementBaseSchema = z.strictObject({
  id: z.string(),
  type: z.enum(ELEMENT_TYPES),
  label: z.string(),
  description: z._default(z.string(), ''),
  width: z._default(z.number(), 1),
  enabledWhen: z.optional(conditionGroupSchema),
}) satisfies z.ZodMiniType<ElementBase>;

const placeholderableSchema = z.strictObject({
  placeholder: z._default(z.string(), ''),
});

export const choiceOptionSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
}) satisfies z.ZodMiniType<ChoiceOption>;

const sectionElementSchema = z.extend(elementBaseSchema, {
  type: z.literal('section'),
}) satisfies z.ZodMiniType<SectionElement>;

const textDisplayElementSchema = z.extend(elementBaseSchema, {
  type: z.literal('textdisplay'),
}) satisfies z.ZodMiniType<TextDisplayElement>;

const questionAttributesSchema = z.extend(defaultValueableSchema, {
  type: z.enum(QUESTION_TYPES),
  required: z._default(z.boolean(), false),
  validations: z._default(z.array(validationRuleSchema), []),
  readonly: z._default(z.boolean(), false),
});

const questionBaseSchema = z.extend(
  elementBaseSchema,
  questionAttributesSchema.shape,
) satisfies z.ZodMiniType<QuestionBase>;

const choiceElementSchema = z.extend(questionBaseSchema, {
  type: z.union([z.literal('choice'), z.literal('dropdown'), z.literal('multiChoice')]),
  options: z.array(choiceOptionSchema),
}) satisfies z.ZodMiniType<ChoiceElement>;

const numberElementSchema = z.extend(questionBaseSchema, {
  ...placeholderableSchema.shape,
  type: z.literal('number'),
  step: z.optional(z.number()),
  unit: z.optional(z.string()),
  decimals: z.optional(z.number()),
}) satisfies z.ZodMiniType<NumberElement>;

const scaleElementSchema = z.extend(questionBaseSchema, {
  type: z.literal('scale'),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  minLabel: z.optional(z.string()),
  maxLabel: z.optional(z.string()),
}) satisfies z.ZodMiniType<ScaleElement>;

const fileElementSchema = z.extend(questionBaseSchema, {
  type: z.literal('file'),
  accept: z.optional(z.string()),
  multiple: z.optional(z.boolean()),
}) satisfies z.ZodMiniType<FileElement>;

const signatureElementSchema = z.extend(questionBaseSchema, {
  type: z.literal('signature'),
}) satisfies z.ZodMiniType<SignatureElement>;

const booleanElementSchema = z.extend(questionBaseSchema, {
  type: z.literal('boolean'),
}) satisfies z.ZodMiniType<BooleanElement>;

const dateElementSchema = z.extend(questionBaseSchema, {
  ...placeholderableSchema.shape,
  type: z.literal('date'),
}) satisfies z.ZodMiniType<DateElement>;

const timeIntervalSchema = z.strictObject({
  value: z.number().check(z.int(), z.minimum(1)),
  multiplier: z.enum(TIME_INTERVAL_MULTIPLIERS),
}) satisfies z.ZodMiniType<TimeInterval>;

const timeElementSchema = z.extend(questionBaseSchema, {
  ...placeholderableSchema.shape,
  type: z.union([z.literal('time'), z.literal('dateTime')]),
  timeInterval: z._default(timeIntervalSchema, { ...DEFAULT_TIME_INTERVAL }),
}) satisfies z.ZodMiniType<TimeElement>;

const inputTypeSchema = z.union([
  z.literal('text'),
  z.literal('email'),
  z.literal('url'),
  z.literal('phone'),
  z.literal('number'),
]);

const textElementSchema = z.extend(questionBaseSchema, {
  ...placeholderableSchema.shape,
  type: z.literal('text'),
  inputType: z.optional(inputTypeSchema),
}) satisfies z.ZodMiniType<TextElement>;

const longTextElementSchema = z.extend(questionBaseSchema, {
  ...placeholderableSchema.shape,
  type: z.literal('longText'),
  rows: z.optional(z.number()),
}) satisfies z.ZodMiniType<LongTextElement>;

const questionDefinitionSchema = z.discriminatedUnion('type', [
  textElementSchema,
  longTextElementSchema,
  numberElementSchema,
  dateElementSchema,
  timeElementSchema,
  booleanElementSchema,
  choiceElementSchema,
  scaleElementSchema,
  fileElementSchema,
  signatureElementSchema,
]) satisfies z.ZodMiniType<QuestionDefinition>;

const groupElementSchema = z.extend(elementBaseSchema, {
  ...defaultValueableSchema.shape,
  type: z.literal('group'),
  collapsible: z._default(z.boolean(), false),
  children: z._default(z.array(z.string()), []),
}) satisfies z.ZodMiniType<GroupElement>;

export const elementDefinitionSchema = z.discriminatedUnion('type', [
  questionDefinitionSchema,
  groupElementSchema,
  sectionElementSchema,
  textDisplayElementSchema,
]) satisfies z.ZodMiniType<ElementDefinition>;

/** Max length of an element label sent to the element PATCH endpoint. */
const ELEMENT_LABEL_MAX = 1000;
/** Max length of an element description sent to the element PATCH endpoint. */
const ELEMENT_DESCRIPTION_MAX = 10_000;

/** Optional field that null removes (see `ElementPatch`). */
function removable<T extends z.ZodMiniType>(schema: T) {
  return z.optional(z.nullable(schema));
}

/**
 * Body of `PATCH /api/forms/:formId/elements/:elementId`. The union of the editable
 * fields of every element type; the server rejects a field the element's type lacks
 * by parsing the patched element with `elementDefinitionSchema`.
 */
export const updateElementSchema = z.strictObject({
  label: z.optional(z.string().check(z.maxLength(ELEMENT_LABEL_MAX))),
  description: removable(z.string().check(z.maxLength(ELEMENT_DESCRIPTION_MAX))),
  width: z.optional(z.number()),
  enabledWhen: removable(conditionGroupSchema),
  required: z.optional(z.boolean()),
  readonly: z.optional(z.boolean()),
  defaultValue: z.optional(z.nullable(defaultValueDefSchema)),
  placeholder: z.optional(z.string()),
  step: removable(z.number()),
  unit: removable(z.string()),
  decimals: removable(z.number()),
  min: z.optional(z.number()),
  max: z.optional(z.number()),
  minLabel: removable(z.string()),
  maxLabel: removable(z.string()),
  accept: removable(z.string()),
  multiple: removable(z.boolean()),
  timeInterval: z.optional(timeIntervalSchema),
  inputType: removable(inputTypeSchema),
  rows: removable(z.number()),
  collapsible: z.optional(z.boolean()),
}) satisfies z.ZodMiniType<ElementPatch>;

export type UpdateElementRequest = z.infer<typeof updateElementSchema>;

export const formElementsSchema = z.record(
  z.string(),
  elementDefinitionSchema,
) satisfies z.ZodMiniType<FormElements>;
