import { type FieldValue, type FileValue, type SignatureValue } from '@shared/model';
import * as z from 'zod/mini';

const fileValueSchema = z.strictObject({
  name: z.string(),
  size: z.number(),
  mimeType: z.string(),
  dataUrl: z.optional(z.url().check(z.startsWith('data:'))),
}) satisfies z.ZodMiniType<FileValue>;

const signatureValueSchema = z.strictObject({
  dataUrl: z.url().check(z.startsWith('data:image/png;base64,')),
  width: z.number(),
  height: z.number(),
  mimeType: z.literal('image/png'),
}) satisfies z.ZodMiniType<SignatureValue>;

export const fieldValueSchema = z.nullable(
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(fileValueSchema),
    signatureValueSchema,
  ]),
) satisfies z.ZodMiniType<FieldValue>;
