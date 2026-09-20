import { elementId, type ElementId, type FormId } from './ids';
import type { FieldValue } from './values.model';

export interface Submission {
  id: string;
  formId: FormId;
  formVersion: number;
  formName: string;
  submittedAt: string;
  durationMs: number;
  values: Record<ElementId, FieldValue>;
}

export function createSubmission(
  form: { id: FormId; name: string; version: number },
  values: Record<ElementId, FieldValue>,
  submittedAt = new Date().toISOString(),
): Submission {
  return {
    id: elementId('submission'),
    formId: form.id,
    formName: form.name,
    formVersion: form.version,
    submittedAt,
    durationMs: 0,
    values,
  };
}
