import { type FieldValue, type FileValue, type SignatureValue } from '@shared/model';
import z from 'zod';

const fileValueSchema = z.strictObject({
  name: z.string(),
  size: z.number(),
  mimeType: z.string(),
  dataUrl: z.url().startsWith('data:').optional(),
}) satisfies z.ZodType<FileValue>;

const signatureValueSchema = z.strictObject({
  dataUrl: z.url().startsWith('data:image/png;base64,'),
  width: z.number(),
  height: z.number(),
  mimeType: z.literal('image/png'),
}) satisfies z.ZodType<SignatureValue>;

export const fieldValueSchema = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(fileValueSchema),
    signatureValueSchema,
  ])
  .nullable() satisfies z.ZodType<FieldValue>;
