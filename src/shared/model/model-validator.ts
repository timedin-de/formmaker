import { z } from 'zod';
import type { ConditionGroup } from './conditions.model';
import { CONDITION_OPERATORS } from './conditions.model';
import type { ElementBase, ElementDefinition, FormDefinition } from './form.model';
import { ELEMENT_TYPES, QUESTION_TYPES } from './form.model';
import { VALIDATION_RULE_TYPES, type ValidationRuleType } from './validation.model';
import { catchFn, type CatchFnResult } from '../helper';

const conditionOperatorSchema = z.enum(CONDITION_OPERATORS);
const validationRuleTypeSchema = z.enum(
  VALIDATION_RULE_TYPES,
) satisfies z.ZodType<ValidationRuleType>;

const literalOperandSchema = z.strictObject({
  kind: z.literal('literal'),
  value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
});

const fieldOperandSchema = z.strictObject({
  kind: z.literal('field'),
  fieldId: z.string(),
});

const conditionOperandSchema = z.discriminatedUnion('kind', [
  literalOperandSchema,
  fieldOperandSchema,
]);

const conditionSchema = z.strictObject({
  fieldId: z.string(),
  fieldType: z.enum(ELEMENT_TYPES).optional(),
  operator: conditionOperatorSchema,
  operand: conditionOperandSchema.optional(),
  operandTo: conditionOperandSchema.optional(),
  values: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const conditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.strictObject({
    logic: z.union([z.literal('all'), z.literal('any')]),
    conditions: z.array(conditionSchema),
    groups: z.array(conditionGroupSchema),
  }),
);

const fileValueSchema = z.strictObject({
  name: z.string(),
  size: z.number(),
  mimeType: z.string(),
  dataUrl: z.string().optional(),
});

const signatureValueSchema = z.strictObject({
  dataUrl: z.string(),
  width: z.number(),
  height: z.number(),
  mimeType: z.literal('image/png'),
});

export const fieldValueSchema = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(fileValueSchema),
    signatureValueSchema,
  ])
  .nullable();

const validationRuleSchema = z.strictObject({
  id: z.string(),
  rule: validationRuleTypeSchema,
  message: z.string().optional(),
  value: z.unknown().optional(),
  valueTo: z.unknown().optional(),
  pattern: z.string().optional(),
  expression: z.string().optional(),
  accept: z.string().optional(),
});

const defaultValueDefSchema = z.union([
  z.strictObject({ kind: z.literal('static'), value: fieldValueSchema }),
  z.strictObject({ kind: z.literal('expression'), expression: z.string() }),
  z.strictObject({ kind: z.literal('fromField'), fieldId: z.string() }),
]);

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------
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

const defaultValueableSchema = z.strictObject({
  defaultValue: z.union([defaultValueDefSchema, z.null()]).default(null),
});

const choiceOptionSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.number()]),
});

const sectionElementSchema = elementBaseSchema.extend({
  type: z.literal('section'),
  heading: z.string(),
});

const textDisplayElementSchema = elementBaseSchema.extend({
  type: z.literal('textdisplay'),
});

const formSettingsSchema = z.strictObject({
  name: z.string().optional(),
  submitLabel: z.string().optional(),
  showProgress: z.boolean().optional(),
  allowBack: z.boolean().optional(),
  navigation: z.union([z.literal('linear'), z.literal('free'), z.literal('auto')]),
  enableAutoSave: z.boolean().optional(),
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
  type: z.union([z.literal('date'), z.literal('time'), z.literal('dateTime')]),
});

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
    legend: z.string().optional(),
    collapsible: z.boolean().optional(),
  })
  .extend({
    elements: z.lazy(() => elementsSchema),
  });

const elementDefinitionSchema: z.ZodType<ElementDefinition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    questionDefinitionSchema,
    groupElementSchema,
    sectionElementSchema,
    textDisplayElementSchema,
  ]),
);

const elementsSchema: z.ZodType<ElementDefinition[]> = z.array(elementDefinitionSchema);

// ---------------------------------------------------------------------------
// Pages & form
// ---------------------------------------------------------------------------
const pageDefinitionSchema = z.strictObject({
  id: z.string(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  enabledWhen: conditionGroupSchema.optional(),
  elements: elementsSchema,
});

export const formDefinitionSchema = z
  .strictObject({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    version: z.number(),
    schemaVersion: z.literal(1),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    settings: formSettingsSchema,
    pages: z.array(pageDefinitionSchema),
  })
  .strict() satisfies z.ZodType<FormDefinition>;

export function parseFormData(json: string): CatchFnResult<FormDefinition> {
  return catchFn(() => formDefinitionSchema.parse(JSON.parse(json)));
}
