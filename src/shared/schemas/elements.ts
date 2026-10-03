import z from 'zod';
import {
  BooleanElement,
  ChoiceElement,
  ChoiceOption,
  DateElement,
  DEFAULT_TIME_INTERVAL,
  ELEMENT_TYPES,
  ElementBase,
  ElementDefinition,
  FileElement,
  GroupElement,
  LongTextElement,
  NumberElement,
  QUESTION_TYPES,
  QuestionBase,
  QuestionDefinition,
  ScaleElement,
  SectionElement,
  SignatureElement,
  TextDisplayElement,
  TextElement,
  TIME_INTERVAL_MULTIPLIERS,
  TimeElement,
  TimeInterval,
} from '../model';
import { conditionGroupSchema } from './conditions';
import { defaultValueableSchema } from './defaultValue';
import { validationRuleSchema } from './validations';

const elementBaseSchema = z.strictObject({
  id: z.string(),
  type: z.enum(ELEMENT_TYPES),
  label: z.string(),
  description: z.string().default(''),
  width: z.number().default(1),
  enabledWhen: conditionGroupSchema.optional(),
}) satisfies z.ZodType<ElementBase>;

const placeholderableSchema = z.strictObject({
  placeholder: z.string().default(''),
});

const choiceOptionSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number()]),
}) satisfies z.ZodType<ChoiceOption>;

const sectionElementSchema = elementBaseSchema.extend({
  type: z.literal('section'),
}) satisfies z.ZodType<SectionElement>;

const textDisplayElementSchema = elementBaseSchema.extend({
  type: z.literal('textdisplay'),
}) satisfies z.ZodType<TextDisplayElement>;

const questionAttributesSchema = defaultValueableSchema.extend({
  type: z.enum(QUESTION_TYPES),
  required: z.boolean().default(false),
  validations: z.array(validationRuleSchema).default([]),
  readonly: z.boolean().default(false),
});

const questionBaseSchema = elementBaseSchema.extend(
  questionAttributesSchema.shape,
) satisfies z.ZodType<QuestionBase>;

const choiceElementSchema = questionBaseSchema.extend({
  type: z.union([z.literal('choice'), z.literal('dropdown'), z.literal('multiChoice')]),
  options: z.array(choiceOptionSchema),
}) satisfies z.ZodType<ChoiceElement>;

const numberElementSchema = questionBaseSchema.extend(placeholderableSchema.shape).extend({
  type: z.literal('number'),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  unit: z.string().optional(),
  decimals: z.number().optional(),
}) satisfies z.ZodType<NumberElement>;

const scaleElementSchema = questionBaseSchema.extend({
  type: z.literal('scale'),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
}) satisfies z.ZodType<ScaleElement>;

const fileElementSchema = questionBaseSchema.extend({
  type: z.literal('file'),
  accept: z.string().optional(),
  multiple: z.boolean().optional(),
}) satisfies z.ZodType<FileElement>;

const signatureElementSchema = questionBaseSchema.extend({
  type: z.literal('signature'),
}) satisfies z.ZodType<SignatureElement>;

const booleanElementSchema = questionBaseSchema.extend({
  type: z.literal('boolean'),
}) satisfies z.ZodType<BooleanElement>;

const dateElementSchema = questionBaseSchema.extend(placeholderableSchema.shape).extend({
  type: z.literal('date'),
}) satisfies z.ZodType<DateElement>;

const timeIntervalSchema = z.strictObject({
  value: z.number().int().min(1),
  multiplier: z.enum(TIME_INTERVAL_MULTIPLIERS),
}) satisfies z.ZodType<TimeInterval>;

const timeElementSchema = questionBaseSchema.extend(placeholderableSchema.shape).extend({
  type: z.union([z.literal('time'), z.literal('dateTime')]),
  timeInterval: timeIntervalSchema.default({ ...DEFAULT_TIME_INTERVAL }),
}) satisfies z.ZodType<TimeElement>;

const textElementSchema = questionBaseSchema.extend(placeholderableSchema.shape).extend({
  type: z.literal('text'),
  inputType: z
    .union([
      z.literal('text'),
      z.literal('email'),
      z.literal('url'),
      z.literal('phone'),
      z.literal('number'),
    ])
    .optional(),
  maxLength: z.number().optional(),
}) satisfies z.ZodType<TextElement>;

const longTextElementSchema = questionBaseSchema.extend(placeholderableSchema.shape).extend({
  type: z.literal('longText'),
  rows: z.number().optional(),
  maxLength: z.number().optional(),
}) satisfies z.ZodType<LongTextElement>;

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
]) satisfies z.ZodType<QuestionDefinition>;

const groupElementSchema = elementBaseSchema
  .extend(defaultValueableSchema.shape)
  .extend({
    type: z.literal('group'),
    collapsible: z.boolean().default(false),
  })
  .extend({
    elements: z.lazy(() => elementsSchema),
  }) satisfies z.ZodType<GroupElement>;

export const elementDefinitionSchema: z.ZodType<ElementDefinition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    questionDefinitionSchema,
    groupElementSchema,
    sectionElementSchema,
    textDisplayElementSchema,
  ]),
) satisfies z.ZodType<ElementDefinition>;

export const elementsSchema: z.ZodType<ElementDefinition[]> = z.array(elementDefinitionSchema);
