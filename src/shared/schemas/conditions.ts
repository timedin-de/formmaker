import z from 'zod';
import {
  type Condition,
  CONDITION_OPERATORS,
  type ConditionGroup,
  type ConditionOperand,
  ELEMENT_TYPES,
  type FieldOperand,
  type LiteralOperand,
} from '../model';

const conditionOperatorSchema = z.enum(CONDITION_OPERATORS);

const literalOperandSchema = z.strictObject({
  kind: z.literal('literal'),
  value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
}) satisfies z.ZodType<LiteralOperand>;

const fieldOperandSchema = z.strictObject({
  kind: z.literal('field'),
  fieldId: z.string(),
}) satisfies z.ZodType<FieldOperand>;

const conditionOperandSchema = z.discriminatedUnion('kind', [
  literalOperandSchema,
  fieldOperandSchema,
]) satisfies z.ZodType<ConditionOperand>;

const conditionSchema = z.strictObject({
  fieldId: z.string(),
  fieldType: z.enum(ELEMENT_TYPES).optional(),
  operator: conditionOperatorSchema,
  operand: conditionOperandSchema.optional(),
  operandTo: conditionOperandSchema.optional(),
  values: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
}) satisfies z.ZodType<Condition>;

export const conditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.strictObject({
    logic: z.union([z.literal('all'), z.literal('any')]),
    conditions: z.array(conditionSchema),
    groups: z.array(conditionGroupSchema),
  }),
) satisfies z.ZodType<ConditionGroup>;
