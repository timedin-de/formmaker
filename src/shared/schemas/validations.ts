import z from 'zod';
import { VALIDATION_RULE_TYPES, type ValidationRule, type ValidationRuleType } from '../model';

const validationRuleTypeSchema = z.enum(
  VALIDATION_RULE_TYPES,
) satisfies z.ZodType<ValidationRuleType>;

export const validationRuleSchema = z.strictObject({
  id: z.string(),
  rule: validationRuleTypeSchema,
  message: z.string().default('This value is invalid'),
  value: z.unknown().optional(),
  valueTo: z.unknown().optional(),
  pattern: z.string().optional(),
  expression: z.string().optional(),
  accept: z.string().optional(),
}) satisfies z.ZodType<ValidationRule>;
