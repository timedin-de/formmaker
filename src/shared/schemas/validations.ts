import z from 'zod';
import { VALIDATION_RULE_TYPES, ValidationRuleType } from '../model';

const validationRuleTypeSchema = z.enum(
  VALIDATION_RULE_TYPES,
) satisfies z.ZodType<ValidationRuleType>;

export const validationRuleSchema = z.strictObject({
  id: z.string(),
  rule: validationRuleTypeSchema,
  message: z.string().optional(),
  value: z.unknown().optional(),
  valueTo: z.unknown().optional(),
  pattern: z.string().optional(),
  expression: z.string().optional(),
  accept: z.string().optional(),
});
