import type { EncryptedValues } from './encryption.model';
import { elementId, type ElementId, type FormId } from './ids';
import type { FieldValue } from './values.model';

export interface SubmissionCreate {
  formId: FormId;
  durationMs: number;
  /** Answers in plain text; encrypted answers are only in `encrypted`. */
  values: Record<ElementId, FieldValue>;
  /** Present when the form encrypts submissions. */
  encrypted?: EncryptedValues;
}

export interface Submission {
  id: string;
  formId: FormId;
  formVersion: number;
  submittedAt: string;
  durationMs: number;
  values: Record<ElementId, FieldValue>;
  /** Encrypted answers, until they are decrypted in the browser of the form owner. */
  encrypted?: EncryptedValues;
}

export function createSubmission(
  form: { id: FormId; name: string; version: number },
  values: Record<ElementId, FieldValue>,
  submittedAt = new Date().toISOString(),
): Submission {
  return {
    id: elementId('submission'),
    formId: form.id,
    formVersion: form.version,
    submittedAt,
    durationMs: 0,
    values,
  };
}
