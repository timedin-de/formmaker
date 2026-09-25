import z from 'zod';
import {
  DEFAULT_TIME_INTERVAL,
  ELEMENT_TYPES,
  ElementBase,
  ElementDefinition,
  QUESTION_TYPES,
  TIME_INTERVAL_MULTIPLIERS,
  TimeElement,
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
});

const sectionElementSchema = elementBaseSchema.extend({
  type: z.literal('section'),
});

const textDisplayElementSchema = elementBaseSchema.extend({
  type: z.literal('textdisplay'),
});

const questionAttributesSchema = defaultValueableSchema.extend({
  type: z.enum(QUESTION_TYPES),
  required: z.boolean().default(false),
  validations: z.array(validationRuleSchema).default([]),
  readonly: z.boolean().default(false),
});

const questionBaseSchema = elementBaseSchema.extend(questionAttributesSchema.shape);

const choiceElementSchema = questionBaseSchema.extend({
  type: z.union([z.literal('choice'), z.literal('dropdown'), z.literal('multiChoice')]),
  options: z.array(choiceOptionSchema),
});

const numberElementSchema = questionBaseSchema.extend(placeholderableSchema.shape).extend({
  type: z.literal('number'),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  unit: z.string().optional(),
  decimals: z.number().optional(),
});

const scaleElementSchema = questionBaseSchema.extend({
  type: z.literal('scale'),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
});

const fileElementSchema = questionBaseSchema.extend({
  type: z.literal('file'),
  accept: z.string().optional(),
  multiple: z.boolean().optional(),
});

const signatureElementSchema = questionBaseSchema.extend({
  type: z.literal('signature'),
});

const booleanElementSchema = questionBaseSchema.extend({
  type: z.literal('boolean'),
});

const dateElementSchema = questionBaseSchema.extend(placeholderableSchema.shape).extend({
  type: z.literal('date'),
});

const timeIntervalSchema = z.strictObject({
  value: z.number().int().min(1),
  multiplier: z.enum(TIME_INTERVAL_MULTIPLIERS),
});

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
});

const longTextElementSchema = questionBaseSchema.extend(placeholderableSchema.shape).extend({
  type: z.literal('longText'),
  rows: z.number().optional(),
  maxLength: z.number().optional(),
});

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
]);

const groupElementSchema = elementBaseSchema
  .extend(defaultValueableSchema.shape)
  .extend({
    type: z.literal('group'),
    collapsible: z.boolean().default(false),
  })
  .extend({
    elements: z.lazy(() => elementsSchema),
  });

export const elementDefinitionSchema: z.ZodType<ElementDefinition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    questionDefinitionSchema,
    groupElementSchema,
    sectionElementSchema,
    textDisplayElementSchema,
  ]),
) satisfies z.ZodType<ElementDefinition>;

export const elementsSchema: z.ZodType<ElementDefinition[]> = z.array(elementDefinitionSchema);
