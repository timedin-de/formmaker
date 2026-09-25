import { Injectable, signal } from '@angular/core';
import { toPortableForm, type FormDefinition, type FormWithOwner } from '@shared/model/form.model';
import type { Submission } from '@shared/model/submission.model';
import {
  formDefinitionSchema,
  formsWithOwnerSchema,
  formWithOwnerSchema,
  submissionsSchema,
} from '@shared/schemas';
import {
  FORM_CACHE_PREFIX,
  FORMS_CACHE_KEY,
  FORMS_CACHE_TTL_MS,
  readCache,
  removeCache,
  SUBMISSIONS_CACHE_PREFIX,
  SUBMISSIONS_CACHE_TTL_MS,
  writeCache,
} from './api-cache';
import { request } from './api-client';

/** Server-backed persistence with a short-lived local response cache. */
@Injectable({ providedIn: 'root' })
export class FormsRepository {
  readonly forms = signal<FormWithOwner[]>([]);
  readonly submissions = signal<Submission[]>([]);
  private hydratePromise: Promise<void> | null = null;

  init(): Promise<void> {
    this.hydratePromise ??= this.hydrate();
    return this.hydratePromise;
  }

  private async hydrate(): Promise<void> {
    const cached = readCache(formsWithOwnerSchema, FORMS_CACHE_KEY, FORMS_CACHE_TTL_MS);
    if (cached) {
      this.forms.set(cached);
      return;
    }
    const forms = await request(formsWithOwnerSchema, '/api/forms');
    this.forms.set(forms);
    writeCache(FORMS_CACHE_KEY, forms);
  }

  async listForms(): Promise<FormWithOwner[]> {
    await this.init();
    return this.forms();
  }

  /** Public share links may load a form without an editor session. */
  async getForm(id: string): Promise<FormDefinition | undefined> {
    const key = FORM_CACHE_PREFIX + id;
    const cached = readCache(formDefinitionSchema, key, FORMS_CACHE_TTL_MS);
    if (cached) return toPortableForm(cached);
    const form = await request(formDefinitionSchema, `/api/forms/${encodeURIComponent(id)}`);
    const portable = toPortableForm(form);
    writeCache(key, portable);
    return portable;
  }

  async newForm(form: FormDefinition): Promise<FormWithOwner> {
    await this.init();
    const saved = await request(formWithOwnerSchema, '/api/forms', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    this.upsert([saved]);
    writeCache(FORM_CACHE_PREFIX + saved.id, toPortableForm(saved));
    writeCache(FORMS_CACHE_KEY, this.forms());
    return saved;
  }

  async saveForm(form: FormDefinition): Promise<FormWithOwner> {
    await this.init();
    const saved = await request(formWithOwnerSchema, '/api/forms', {
      method: 'PUT',
      body: JSON.stringify(form),
    });
    this.upsert([saved]);
    writeCache(FORM_CACHE_PREFIX + saved.id, toPortableForm(saved));
    writeCache(FORMS_CACHE_KEY, this.forms());
    return saved;
  }

  async deleteForm(id: string): Promise<void> {
    await this.init();
    await request(undefined, `/api/forms/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.forms.set(this.forms().filter((form) => form.id !== id));
    writeCache(FORMS_CACHE_KEY, this.forms());
    removeCache(FORM_CACHE_PREFIX + id);
    removeCache(SUBMISSIONS_CACHE_PREFIX + id);
  }

  async submissionsFor(formId: string): Promise<Submission[]> {
    await this.init();
    const key = SUBMISSIONS_CACHE_PREFIX + formId;
    const list =
      readCache(submissionsSchema, key, SUBMISSIONS_CACHE_TTL_MS) ??
      (await request(submissionsSchema, `/api/forms/${encodeURIComponent(formId)}/submissions`));
    writeCache(key, list);
    this.submissions.set([
      ...list,
      ...this.submissions().filter((submission) => submission.formId !== formId),
    ]);
    return list;
  }

  async addSubmission(submission: Submission): Promise<void> {
    await request(undefined, `/api/forms/${encodeURIComponent(submission.formId)}/submissions`, {
      method: 'POST',
      body: JSON.stringify(submission),
    });
    this.submissions.update((current) => [
      submission,
      ...current.filter((item) => item.id !== submission.id),
    ]);
    removeCache(SUBMISSIONS_CACHE_PREFIX + submission.formId);
  }

  async deleteSubmission(formId: string, submissionId: string): Promise<void> {
    await request(
      undefined,
      `/api/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
      { method: 'DELETE' },
    );
    this.submissions.set(this.submissions().filter((item) => item.id !== submissionId));
    removeCache(SUBMISSIONS_CACHE_PREFIX + formId);
  }

  async clearSubmissions(formId: string): Promise<void> {
    await request(undefined, `/api/forms/${encodeURIComponent(formId)}/submissions`, {
      method: 'DELETE',
    });
    this.submissions.set(this.submissions().filter((item) => item.formId !== formId));
    removeCache(SUBMISSIONS_CACHE_PREFIX + formId);
  }

  private upsert(updated: FormWithOwner[]): void {
    this.forms.update((existing) => {
      const byId = new Map(existing.map((form) => [form.id, form]));
      for (const form of updated) byId.set(form.id, form);
      return [...byId.values()];
    });
  }
}
