import { FieldValue, FileValue, SignatureValue } from '@shared/model';
import z from 'zod';

const fileValueSchema = z.strictObject({
  name: z.string(),
  size: z.number(),
  mimeType: z.string(),
  dataUrl: z.string().optional(),
}) satisfies z.ZodType<FileValue>;

const signatureValueSchema = z.strictObject({
  dataUrl: z.string(),
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
