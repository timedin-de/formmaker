import * as z from 'zod/mini';
import { type Submission, type SubmissionCreate } from '../model';
import { fieldValueSchema } from './fieldValue';

export const submissionCreateSchema = z.strictObject({
  formId: z.string().check(z.minLength(1), z.maxLength(128)),
  durationMs: z.number().check(z.nonnegative()),
  values: z.record(z.string().check(z.minLength(1), z.maxLength(128)), fieldValueSchema),
}) satisfies z.ZodMiniType<SubmissionCreate>;

export const submissionSchema = z.object({
  ...submissionCreateSchema.shape,
  id: z.string().check(z.minLength(1), z.maxLength(128)),
  formVersion: z.number().check(z.int(), z.positive()),
  submittedAt: z.iso.datetime(),
}) satisfies z.ZodMiniType<Submission>;

export const submissionsSchema = z.array(submissionSchema);
