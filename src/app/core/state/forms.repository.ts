import type { FormDefinition } from '../model/form.model';
import type { Submission } from '../model/submission.model';
import { buildDemoForm } from './demo-form';

const FORMS_KEY = 'formmaker.forms.v1';
const SUBMISSIONS_KEY = 'formmaker.submissions.v1';

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* ignore quota errors */
  }
}

/** Lightweight local persistence for authored forms and submitted responses. */
export class FormsRepository {
  listForms(): FormDefinition[] {
    return read<FormDefinition>(FORMS_KEY);
  }

  getForm(id: string): FormDefinition | null {
    return this.listForms().find((f) => f.id === id) ?? null;
  }

  saveForm(form: FormDefinition): FormDefinition {
    const all = read<FormDefinition>(FORMS_KEY);
    const idx = all.findIndex((f) => f.id === form.id);
    const normalized = { ...form, updatedAt: new Date().toISOString() };
    if (idx >= 0) all[idx] = normalized;
    else all.push(normalized);
    write(FORMS_KEY, all);
    return normalized;
  }

  deleteForm(id: string): void {
    write(
      FORMS_KEY,
      read<FormDefinition>(FORMS_KEY).filter((f) => f.id !== id),
    );
  }

  seedDemo(): void {
    if (this.listForms().length === 0) {
      this.saveForm(buildDemoForm());
    }
  }

  listSubmissions(): Submission[] {
    const all = read<Submission>(SUBMISSIONS_KEY);
    return [...all].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  submissionsFor(formId: string): Submission[] {
    return this.listSubmissions().filter((s) => s.formId === formId);
  }

  addSubmission(submission: Submission): void {
    const all = read<Submission>(SUBMISSIONS_KEY);
    write(SUBMISSIONS_KEY, [submission, ...all].slice(0, 500));
  }

  clearSubmissions(): void {
    write(SUBMISSIONS_KEY, []);
  }

  deleteSubmission(id: string): void {
    write(
      SUBMISSIONS_KEY,
      read<Submission>(SUBMISSIONS_KEY).filter((s) => s.id !== id),
    );
  }
}
