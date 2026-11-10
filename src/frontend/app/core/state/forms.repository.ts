import { inject, Injectable, signal } from '@angular/core';
import { toSaveableForm } from '@shared/helper';
import {
  toPortableForm,
  type ChoiceOption,
  type ElementDefinition,
  type FormDefinition,
  type FormWithOwner,
  type PageDefinition,
} from '@shared/model/form.model';
import type { Submission, SubmissionCreate } from '@shared/model/submission.model';
import type { ValidationRule } from '@shared/model/validation.model';
import {
  choiceOptionSchema,
  cloneElementResponseSchema,
  clonePageResponseSchema,
  type CloneElementResponse,
  type ClonePageResponse,
  type CreateElementRequest,
  type CreateOptionRequest,
  type CreateValidationRuleRequest,
  type MoveElementRequest,
  type MoveOptionRequest,
  type UpdatePageRequest,
  type NewFormRequest,
  elementDefinitionSchema,
  formDefinitionSchema,
  formsWithOwnerSchema,
  formWithOwnerSchema,
  pageDefinitionSchema,
  submissionSchema,
  submissionsSchema,
  type UpdateElementRequest,
  type UpdateOptionRequest,
  type UpdateValidationRuleRequest,
  validationRuleSchema,
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
import { ApiClient } from './api-client';

/** `/api/forms/:formId/elements`, or the element `elementId` below it. */
function elementUrl(formId: string, elementId?: string): string {
  const base = `/api/forms/${encodeURIComponent(formId)}/elements`;
  return elementId === undefined ? base : `${base}/${encodeURIComponent(elementId)}`;
}

function optionsUrl(formId: string, elementId: string): string {
  return `${elementUrl(formId, elementId)}/options`;
}

function optionUrl(formId: string, elementId: string, optionId: string): string {
  return `${optionsUrl(formId, elementId)}/${encodeURIComponent(optionId)}`;
}

function validationsUrl(formId: string, elementId: string): string {
  return `${elementUrl(formId, elementId)}/validations`;
}

function validationRuleUrl(formId: string, elementId: string, ruleId: string): string {
  return `${validationsUrl(formId, elementId)}/${encodeURIComponent(ruleId)}`;
}

/** Server-backed persistence with a short-lived local response cache. */
@Injectable({ providedIn: 'root' })
export class FormsRepository {
  private readonly api = inject(ApiClient);
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
    const forms = await this.api.request(formsWithOwnerSchema, '/api/forms');
    this.forms.set(forms);
    writeCache(FORMS_CACHE_KEY, forms);
  }

  /**Get Users visible forms, ordered by update-date*/
  async listForms(): Promise<FormWithOwner[]> {
    await this.init();
    return [...this.forms()].sort((a, b) =>
      a.updatedAt === b.updatedAt ? 0 : (a.updatedAt ?? '') > (b.updatedAt ?? '') ? -1 : 1,
    );
  }

  /** Public share links may load a form without an editor session. */
  async getForm(id: string): Promise<FormDefinition | undefined> {
    const key = FORM_CACHE_PREFIX + id;
    const cached = readCache(formDefinitionSchema, key, FORMS_CACHE_TTL_MS);
    if (cached) return toPortableForm(cached);
    const form = await this.api.request(
      formDefinitionSchema,
      `/api/forms/${encodeURIComponent(id)}`,
    );
    const portable = toPortableForm(form);
    writeCache(key, portable);
    return portable;
  }

  /** Creates an empty form on the server whose first page is titled `pageTitle`. */
  async newForm(pageTitle: string): Promise<FormDefinition> {
    await this.init();
    const saved = await this.api.request(formWithOwnerSchema, '/api/forms', {
      method: 'POST',
      body: JSON.stringify({ pageTitle } satisfies NewFormRequest),
    });
    this.upsert([saved]);
    writeCache(FORM_CACHE_PREFIX + saved.id, toPortableForm(saved));
    writeCache(FORMS_CACHE_KEY, this.forms());
    return saved;
  }

  async importForm(form: FormDefinition): Promise<FormDefinition> {
    await this.init();
    const saved = await this.api.request(formWithOwnerSchema, '/api/forms/import', {
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
    const saved = await this.api.request(
      formWithOwnerSchema,
      `/api/forms/${encodeURIComponent(form.id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(toSaveableForm(form)),
      },
    );
    this.upsert([saved]);
    writeCache(FORM_CACHE_PREFIX + saved.id, toPortableForm(saved));
    writeCache(FORMS_CACHE_KEY, this.forms());
    return saved;
  }

  /** Creates and persists a new page on the server; returns the page as generated there. */
  async addPage(formId: string, title: string): Promise<PageDefinition> {
    const page = await this.api.request(
      pageDefinitionSchema,
      `/api/forms/${encodeURIComponent(formId)}/pages`,
      { method: 'POST', body: JSON.stringify({ title }) },
    );
    removeCache(FORM_CACHE_PREFIX + formId);
    return page;
  }

  /** Clones a page with its elements on the server; returns the copy as generated there. */
  async clonePage(formId: string, pageId: string, suffix: string): Promise<ClonePageResponse> {
    const clone = await this.api.request(
      clonePageResponseSchema,
      `/api/forms/${encodeURIComponent(formId)}/pages/${encodeURIComponent(pageId)}/clone`,
      { method: 'POST', body: JSON.stringify({ suffix }) },
    );
    removeCache(FORM_CACHE_PREFIX + formId);
    return clone;
  }

  /**
   * Patches the fields of a page on the server; returns the page as stored there.
   * `keepalive` lets the request outlive the page, e.g. when sent while it is being closed.
   */
  async updatePage(
    formId: string,
    pageId: string,
    patch: UpdatePageRequest,
    { keepalive = false }: { keepalive?: boolean } = {},
  ): Promise<PageDefinition> {
    const page = await this.api.request(
      pageDefinitionSchema,
      `/api/forms/${encodeURIComponent(formId)}/pages/${encodeURIComponent(pageId)}`,
      { method: 'PATCH', body: JSON.stringify(patch), keepalive },
    );
    removeCache(FORM_CACHE_PREFIX + formId);
    return page;
  }

  async deletePage(formId: string, pageId: string) {
    await this.api.request(
      undefined,
      `/api/forms/${encodeURIComponent(formId)}/pages/${encodeURIComponent(pageId)}`,
      { method: 'DELETE' },
    );
    removeCache(FORM_CACHE_PREFIX + formId);
  }

  /** Creates and persists a new element on the server; returns the element as generated there. */
  async addElement(formId: string, request: CreateElementRequest): Promise<ElementDefinition> {
    const element = await this.api.request(elementDefinitionSchema, elementUrl(formId), {
      method: 'POST',
      body: JSON.stringify(request),
    });
    removeCache(FORM_CACHE_PREFIX + formId);
    return element;
  }

  /** Clones an element subtree on the server; returns the copy as generated there. */
  async cloneElement(
    formId: string,
    elementId: string,
    suffix: string,
  ): Promise<CloneElementResponse> {
    const clone = await this.api.request(
      cloneElementResponseSchema,
      `${elementUrl(formId, elementId)}/clone`,
      { method: 'POST', body: JSON.stringify({ suffix }) },
    );
    removeCache(FORM_CACHE_PREFIX + formId);
    return clone;
  }

  /**
   * Patches the fields of an element on the server; returns the element as stored there.
   * `keepalive` lets the request outlive the page, e.g. when sent while it is being closed.
   */
  async updateElement(
    formId: string,
    elementId: string,
    patch: UpdateElementRequest,
    { keepalive = false }: { keepalive?: boolean } = {},
  ): Promise<ElementDefinition> {
    const element = await this.api.request(elementDefinitionSchema, elementUrl(formId, elementId), {
      method: 'PATCH',
      body: JSON.stringify(patch),
      keepalive,
    });
    removeCache(FORM_CACHE_PREFIX + formId);
    return element;
  }

  /** Moves an element with everything below it on the server (see `MoveElementRequest`). */
  async moveElement(formId: string, elementId: string, request: MoveElementRequest) {
    await this.api.request(undefined, `${elementUrl(formId, elementId)}/move`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
    removeCache(FORM_CACHE_PREFIX + formId);
  }

  /** Appends a new option to a choice element on the server; returns the option as generated there. */
  async addOption(
    formId: string,
    elementId: string,
    request: CreateOptionRequest,
  ): Promise<ChoiceOption> {
    const option = await this.api.request(choiceOptionSchema, optionsUrl(formId, elementId), {
      method: 'POST',
      body: JSON.stringify(request),
    });
    removeCache(FORM_CACHE_PREFIX + formId);
    return option;
  }

  /**
   * Patches an option of a choice element on the server; returns the option as stored there.
   * `keepalive` lets the request outlive the page, e.g. when sent while it is being closed.
   */
  async updateOption(
    formId: string,
    elementId: string,
    optionId: string,
    patch: UpdateOptionRequest,
    { keepalive = false }: { keepalive?: boolean } = {},
  ): Promise<ChoiceOption> {
    const option = await this.api.request(
      choiceOptionSchema,
      optionUrl(formId, elementId, optionId),
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
        keepalive,
      },
    );
    removeCache(FORM_CACHE_PREFIX + formId);
    return option;
  }

  /** Moves an option of a choice element on the server (see `MoveOptionRequest`). */
  async moveOption(
    formId: string,
    elementId: string,
    optionId: string,
    request: MoveOptionRequest,
  ) {
    await this.api.request(undefined, `${optionUrl(formId, elementId, optionId)}/move`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
    removeCache(FORM_CACHE_PREFIX + formId);
  }

  /** Appends a validation rule to a question on the server; returns the rule as generated there. */
  async addValidationRule(
    formId: string,
    elementId: string,
    request: CreateValidationRuleRequest,
  ): Promise<ValidationRule> {
    const rule = await this.api.request(validationRuleSchema, validationsUrl(formId, elementId), {
      method: 'POST',
      body: JSON.stringify(request),
    });
    removeCache(FORM_CACHE_PREFIX + formId);
    return rule;
  }

  /** Patches a validation rule of a question on the server; returns the rule as stored there. */
  async updateValidationRule(
    formId: string,
    elementId: string,
    ruleId: string,
    patch: UpdateValidationRuleRequest,
  ): Promise<ValidationRule> {
    const rule = await this.api.request(
      validationRuleSchema,
      validationRuleUrl(formId, elementId, ruleId),
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    removeCache(FORM_CACHE_PREFIX + formId);
    return rule;
  }

  async deleteValidationRule(formId: string, elementId: string, ruleId: string) {
    await this.api.request(undefined, validationRuleUrl(formId, elementId, ruleId), {
      method: 'DELETE',
    });
    removeCache(FORM_CACHE_PREFIX + formId);
  }

  async deleteOption(formId: string, elementId: string, optionId: string) {
    await this.api.request(undefined, optionUrl(formId, elementId, optionId), { method: 'DELETE' });
    removeCache(FORM_CACHE_PREFIX + formId);
  }

  async deleteElement(formId: string, elementId: string) {
    await this.api.request(undefined, elementUrl(formId, elementId), { method: 'DELETE' });
    removeCache(FORM_CACHE_PREFIX + formId);
  }

  async deleteForm(id: string): Promise<void> {
    await this.init();
    await this.api.request(undefined, `/api/forms/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
      (await this.api.request(
        submissionsSchema,
        `/api/forms/${encodeURIComponent(formId)}/submissions`,
      ));
    writeCache(key, list);
    this.submissions.set([
      ...list,
      ...this.submissions().filter((submission) => submission.formId !== formId),
    ]);
    return list;
  }

  async addSubmission(submission: SubmissionCreate): Promise<Submission> {
    const serverSubmission = await this.api.request<Submission>(
      submissionSchema,
      `/api/forms/${encodeURIComponent(submission.formId)}/submissions`,
      {
        method: 'POST',
        body: JSON.stringify(submission),
      },
    );
    this.submissions.update((current) => [
      serverSubmission,
      ...current.filter((item) => item.id !== serverSubmission.id),
    ]);
    removeCache(SUBMISSIONS_CACHE_PREFIX + submission.formId);
    return serverSubmission;
  }

  async deleteSubmission(formId: string, submissionId: string): Promise<void> {
    await this.api.request(
      undefined,
      `/api/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
      { method: 'DELETE' },
    );
    this.submissions.set(this.submissions().filter((item) => item.id !== submissionId));
    removeCache(SUBMISSIONS_CACHE_PREFIX + formId);
  }

  async clearSubmissions(formId: string): Promise<void> {
    await this.api.request(undefined, `/api/forms/${encodeURIComponent(formId)}/submissions`, {
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
