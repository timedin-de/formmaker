import type { FormDefinition } from '../src/app/shared/model/form.model';
import type { Submission } from '../src/app/shared/model/submission.model';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const files = {
  forms: path.join(dataDir, 'forms.json'),
  submissions: path.join(dataDir, 'submissions.json'),
};

function load<T>(key: keyof typeof files, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(files[key], 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function save(key: keyof typeof files, value: unknown): void {
  const tmp = `${files[key]}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, files[key]);
}

export const store = {
  getForms(): FormDefinition[] {
    return load<FormDefinition[]>('forms', []);
  },

  getForm(id: string): FormDefinition | null {
    return this.getForms().find((f) => f.id === id) ?? null;
  },

  saveForm(form: FormDefinition): FormDefinition {
    const all = this.getForms();
    const idx = all.findIndex((f) => f.id === form.id);
    const normalized: FormDefinition = { ...form, updatedAt: new Date().toISOString() };
    if (idx >= 0) all[idx] = normalized;
    else all.push(normalized);
    save('forms', all);
    return normalized;
  },

  deleteForm(id: string): void {
    save(
      'forms',
      this.getForms().filter((f) => f.id !== id),
    );
  },

  getSubmissionsFor(formId: string): Submission[] {
    return load<Submission[]>('submissions', [])
      .filter((s) => s.formId === formId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  },

  addSubmission(submission: Submission): Submission {
    const all = load<Submission[]>('submissions', []);
    save('submissions', [submission, ...all].slice(0, 5000));
    return submission;
  },

  clearSubmissions(formId: string): void {
    save(
      'submissions',
      load<Submission[]>('submissions', []).filter((s) => s.formId !== formId),
    );
  },

  deleteSubmission(formId: string, submissionId: string): void {
    save(
      'submissions',
      load<Submission[]>('submissions', []).filter(
        (s) => !(s.id === submissionId && s.formId === formId),
      ),
    );
  },
};
