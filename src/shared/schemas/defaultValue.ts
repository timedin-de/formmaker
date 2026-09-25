import z from 'zod';
import { fieldValueSchema } from './fieldValue';

export const defaultValueDefSchema = z.union([
  z.strictObject({ kind: z.literal('static'), value: fieldValueSchema }),
  z.strictObject({ kind: z.literal('expression'), expression: z.string() }),
  z.strictObject({ kind: z.literal('fromField'), fieldId: z.string() }),
]);
export const defaultValueableSchema = z.strictObject({
  defaultValue: z.union([defaultValueDefSchema, z.null()]).default(null),
});
