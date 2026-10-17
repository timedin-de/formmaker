import * as z from 'zod/mini';
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
  value: z.nullable(z.union([z.string(), z.number(), z.boolean()])),
}) satisfies z.ZodMiniType<LiteralOperand>;

const fieldOperandSchema = z.strictObject({
  kind: z.literal('field'),
  fieldId: z.string(),
}) satisfies z.ZodMiniType<FieldOperand>;

const conditionOperandSchema = z.discriminatedUnion('kind', [
  literalOperandSchema,
  fieldOperandSchema,
]) satisfies z.ZodMiniType<ConditionOperand>;

const conditionSchema = z.strictObject({
  fieldId: z.string(),
  fieldType: z.optional(z.enum(ELEMENT_TYPES)),
  operator: conditionOperatorSchema,
  operand: z.optional(conditionOperandSchema),
  operandTo: z.optional(conditionOperandSchema),
  values: z.optional(z.array(z.union([z.string(), z.number(), z.boolean()]))),
}) satisfies z.ZodMiniType<Condition>;

export const conditionGroupSchema: z.ZodMiniType<ConditionGroup> = z.lazy(() =>
  z.strictObject({
    logic: z.union([z.literal('all'), z.literal('any')]),
    conditions: z.array(conditionSchema),
    groups: z.array(conditionGroupSchema),
  }),
) satisfies z.ZodMiniType<ConditionGroup>;
