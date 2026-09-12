import { Injectable, signal } from '@angular/core';
import type { FormDefinition } from '../../shared/model/form.model';
import type { Submission } from '../../shared/model/submission.model';
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : undefined),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function readToken(): string | null {
  try {
    return sessionStorage.getItem('formmaker.token');
  } catch {
    return null;
  }
}

/**
 * Persistence layer for authored forms and submitted responses.
 *
 * Prefers the backend API (see server/). When the API is unreachable the
 * repository degrades gracefully to localStorage so the app stays usable
 * offline; `offline()` reflects which backend is currently in use.
 */
@Injectable({ providedIn: 'root' })
export class FormsRepository {
  /** true when the backend API is unreachable and localStorage is used instead. */
  readonly offline = signal<boolean>(false);
  readonly forms = signal<FormDefinition[]>([]);
  readonly submissions = signal<Submission[]>([]);

  private hydratePromise: Promise<void> | null = null;

  /** Hydrate in-memory state from the API (falling back to localStorage). */
  init(): Promise<void> {
    this.hydratePromise ??= this.hydrate();
    return this.hydratePromise;
  }

  private async hydrate(): Promise<void> {
    try {
      const forms = await request<FormDefinition[]>('/api/forms');
      this.offline.set(false);
      this.forms.set(forms);
      write(FORMS_KEY, forms);
    } catch {
      this.offline.set(true);
      this.forms.set(read<FormDefinition>(FORMS_KEY));
    }
  }

  async listForms(): Promise<FormDefinition[]> {
    await this.init();
    return this.forms();
  }

  async getForm(id: string): Promise<FormDefinition | null> {
    await this.init();
    if (!this.offline()) {
      try {
        return await request<FormDefinition>(`/api/forms/${encodeURIComponent(id)}`);
      } catch {
        this.offline.set(true);
      }
    }
    return this.forms().find((f) => f.id === id) ?? null;
  }

  async saveForm(form: FormDefinition): Promise<FormDefinition> {
    await this.init();
    if (!this.offline()) {
      try {
        const saved = await request<FormDefinition>('/api/forms', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        this.upsert([saved]);
        write(FORMS_KEY, this.forms());
        return saved;
      } catch {
        this.offline.set(true);
      }
    }
    const normalized: FormDefinition = { ...form, updatedAt: new Date().toISOString() };
    this.upsert([normalized]);
    write(FORMS_KEY, this.forms());
    return normalized;
  }

  async deleteForm(id: string): Promise<void> {
    await this.init();
    if (!this.offline()) {
      try {
        await request<void>(`/api/forms/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {
        this.offline.set(true);
      }
    }
    this.forms.set(this.forms().filter((f) => f.id !== id));
    write(FORMS_KEY, this.forms());
  }

  /** Seed a demo form only when running fully offline with no forms yet. */
  async seedDemo(): Promise<void> {
    await this.init();
    if (this.offline() && this.forms().length === 0) {
      await this.saveForm(buildDemoForm());
    }
  }

  async submissionsFor(formId: string): Promise<Submission[]> {
    await this.init();
    if (!this.offline()) {
      try {
        const list = await request<Submission[]>(
          `/api/forms/${encodeURIComponent(formId)}/submissions`,
        );
        const merged = [...list, ...this.submissions().filter((s) => s.formId !== formId)].sort(
          (a, b) => b.submittedAt.localeCompare(a.submittedAt),
        );
        this.submissions.set(merged);
        write(SUBMISSIONS_KEY, merged);
        return list;
      } catch {
        this.offline.set(true);
      }
    }
    return this.submissions()
      .filter((s) => s.formId === formId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  async addSubmission(submission: Submission): Promise<void> {
    await this.init();
    if (!this.offline()) {
      try {
        await request<void>(`/api/forms/${encodeURIComponent(submission.formId)}/submissions`, {
          method: 'POST',
          body: JSON.stringify(submission),
        });
      } catch {
        this.offline.set(true);
      }
    }
    const all = [submission, ...this.submissions().filter((s) => s.id !== submission.id)].slice(
      0,
      2000,
    );
    this.submissions.set(all);
    write(SUBMISSIONS_KEY, all);
  }

  async deleteSubmission(formId: string, submissionId: string): Promise<void> {
    await this.init();
    if (!this.offline()) {
      try {
        await request<void>(
          `/api/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
          { method: 'DELETE' },
        );
      } catch {
        this.offline.set(true);
      }
    }
    const all = this.submissions().filter((s) => !(s.formId === formId && s.id === submissionId));
    this.submissions.set(all);
    write(SUBMISSIONS_KEY, all);
  }

  async clearSubmissions(formId: string): Promise<void> {
    await this.init();
    if (!this.offline()) {
      try {
        await request<void>(`/api/forms/${encodeURIComponent(formId)}/submissions`, {
          method: 'DELETE',
        });
      } catch {
        this.offline.set(true);
      }
    }
    const all = this.submissions().filter((s) => s.formId !== formId);
    this.submissions.set(all);
    write(SUBMISSIONS_KEY, all);
  }

  private upsert(updated: FormDefinition[]): void {
    this.forms.update((existing) => {
      const byId = new Map(existing.map((f) => [f.id, f]));
      for (const f of updated) byId.set(f.id, f);
      return [...byId.values()];
    });
  }
}
