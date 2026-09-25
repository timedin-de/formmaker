import z from 'zod';
import { CONDITION_OPERATORS, ConditionGroup, ELEMENT_TYPES } from '../model';

const conditionOperatorSchema = z.enum(CONDITION_OPERATORS);

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

export const conditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.strictObject({
    logic: z.union([z.literal('all'), z.literal('any')]),
    conditions: z.array(conditionSchema),
    groups: z.array(conditionGroupSchema),
  }),
);
