import * as z from 'zod/mini';
import { type Submission, type SubmissionCreate } from '../model';
import { encryptedValuesSchema } from './encryption';
import { fieldValueSchema } from './fieldValue';

/** Answers keyed by element id. */
export const submissionValuesSchema = z.record(
  z.string().check(z.minLength(1), z.maxLength(128)),
  fieldValueSchema,
);

export const submissionCreateSchema = z.strictObject({
  formId: z.string().check(z.minLength(1), z.maxLength(128)),
  durationMs: z.number().check(z.nonnegative()),
  values: submissionValuesSchema,
  encrypted: z.optional(encryptedValuesSchema),
}) satisfies z.ZodMiniType<SubmissionCreate>;

export const submissionSchema = z.object({
  ...submissionCreateSchema.shape,
  id: z.string().check(z.minLength(1), z.maxLength(128)),
  formVersion: z.number().check(z.int(), z.positive()),
  submittedAt: z.iso.datetime(),
}) satisfies z.ZodMiniType<Submission>;

export const submissionsSchema = z.array(submissionSchema);
