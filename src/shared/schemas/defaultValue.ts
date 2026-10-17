import { type DefaultValueDef } from '@shared/model';
import * as z from 'zod/mini';
import { fieldValueSchema } from './fieldValue';

export const defaultValueDefSchema = z.union([
  z.strictObject({ kind: z.literal('static'), value: fieldValueSchema }),
  z.strictObject({ kind: z.literal('expression'), expression: z.string() }),
  z.strictObject({ kind: z.literal('fromField'), fieldId: z.string() }),
]) satisfies z.ZodMiniType<DefaultValueDef>;
export const defaultValueableSchema = z.strictObject({
  defaultValue: z._default(z.union([defaultValueDefSchema, z.null()]), null),
});
