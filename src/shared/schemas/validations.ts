import * as z from 'zod/mini';
import { VALIDATION_RULE_TYPES, type ValidationRule, type ValidationRuleType } from '../model';

const validationRuleTypeSchema = z.enum(
  VALIDATION_RULE_TYPES,
) satisfies z.ZodMiniType<ValidationRuleType>;

export const validationRuleSchema = z.strictObject({
  id: z.string(),
  rule: validationRuleTypeSchema,
  message: z._default(z.string(), 'This value is invalid'),
  value: z.optional(z.unknown()),
  valueTo: z.optional(z.unknown()),
  pattern: z.optional(z.string()),
  expression: z.optional(z.string()),
  accept: z.optional(z.string()),
}) satisfies z.ZodMiniType<ValidationRule>;

/** Max length of a rule message sent to the validation rule endpoint. */
const RULE_MESSAGE_MAX = 1000;

/** Body of `POST /forms/:formId/elements/:elementId/validations`; the server assigns the id. */
export const createValidationRuleSchema = z.strictObject({
  rule: validationRuleTypeSchema,
  message: z.string().check(z.maxLength(RULE_MESSAGE_MAX)),
});

export type CreateValidationRuleRequest = z.infer<typeof createValidationRuleSchema>;
