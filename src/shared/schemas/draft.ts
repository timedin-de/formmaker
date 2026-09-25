import { z } from 'zod';

import { SavedDraft } from '../model/draft';
import { fieldValueSchema } from './fieldValue';

export const valuesMapSchema = z.record(z.string(), fieldValueSchema);

export const draftSchema = z.strictObject({
  savedAt: z.number(),
  formVersion: z.number(),
  values: valuesMapSchema,
}) satisfies z.ZodType<SavedDraft>;
