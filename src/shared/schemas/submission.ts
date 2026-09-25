import z from 'zod';
import { Submission } from '../model';
import { fieldValueSchema } from './fieldValue';

export const submissionSchema = z.object({
  id: z.string().min(1).max(128),
  formId: z.string().min(1).max(128),
  formVersion: z.number().int().positive(),
  formName: z.string().max(500),
  submittedAt: z.iso.datetime(),
  durationMs: z.number().nonnegative(),
  values: z.record(z.string().min(1).max(128), fieldValueSchema),
}) satisfies z.ZodType<Submission>;
export const submissionsSchema = z.array(submissionSchema);
