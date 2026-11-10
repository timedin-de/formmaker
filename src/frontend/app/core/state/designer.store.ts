import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { catchFn, isChoice, isQuestion } from '@shared/helper';
import {
  addPage,
  type ElementPatch,
  insertElement,
  moveElement,
  moveElementTo,
  patchElement,
  removeElement,
  removePage,
  updateElement,
} from '@shared/model/form-ops';
import {
  childrenOf,
  type ElementParent,
  type FormDocument,
  getElement,
  parentOf,
  subtreeIds,
} from '@shared/model/form-tree';
import type {
  ChoiceOption,
  ElementDefinition,
  ElementType,
  FormDefinition,
  FormSettings,
  PageDefinition,
  SaveFormDefinition,
} from '@shared/model/form.model';
import type { ElementId } from '@shared/model/ids';
import type { ValidationRule } from '@shared/model/validation.model';
import {
  type CreateValidationRuleRequest,
  parseFormData,
  type UpdateOptionRequest,
  type UpdateValidationRuleRequest,
} from '@shared/schemas';
import { I18nService, type TranslationKey } from '../i18n/translation.service';
import { ApiError } from './api-error';
import { FormsRepository } from './forms.repository';

const STORAGE_KEY = 'formmaker.designer.v1';
/**
 * How long an edit waits for further edits of the same element before it is sent, so
 * e.g. changing the label and description and ticking "required" is one request.
 * Each edit restarts the wait; leaving the element sends at once (see `select`).
 */
export const PATCH_DELAY_MS = 3000;

/** An edit that is applied locally but not sent yet; see `queuePatch`. */
interface PendingPatch {
  formId: string;
  /** The element the edit belongs to, so removing the element drops it. */
  elementId: ElementId;
  /** Every edit of the same thing since the last send, merged. */
  patch: object;
  send: (keepalive: boolean) => Promise<unknown>;
  /** Shown when sending fails. */
  failed: TranslationKey;
  timer: ReturnType<typeof setTimeout>;
}

/** A failed edit, read and cleared by the property panel to show a message. */
export interface PatchError {
  error: unknown;
  message: TranslationKey;
}

function optionKey(elementId: ElementId, optionId: string): string {
  return `option:${elementId}/${optionId}`;
}

function elementKey(elementId: ElementId): string {
  return `element:${elementId}`;
}

/** `patch` with every undefined field set to null, which removes it (see `ElementPatch`). */
function toElementPatch(patch: ElementPatch): ElementPatch {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [key, value === undefined ? null : value]),
  );
}

/** Replaces the options of the choice element `elementId`; returns the input without one. */
function updateOptions(
  form: FormDefinition,
  elementId: ElementId,
  update: (options: ChoiceOption[]) => ChoiceOption[],
): FormDefinition {
  const el = getElement(form, elementId);
  if (!el || !isChoice(el)) return form;
  return updateElement(form, elementId, { options: update(el.options) });
}

/** Replaces the validation rules of the question `elementId`; returns the input without one. */
function updateValidations(
  form: FormDefinition,
  elementId: ElementId,
  update: (rules: ValidationRule[]) => ValidationRule[],
): FormDefinition {
  const el = getElement(form, elementId);
  if (!el || !isQuestion(el)) return form;
  return updateElement(form, elementId, { validations: update(el.validations ?? []) });
}

@Injectable()
export class DesignerStore {
  private readonly i18n = inject(I18nService);
  private readonly repository = inject(FormsRepository);
  readonly _form = signal<FormDefinition | undefined>(undefined);
  readonly form = computed(() => {
    const f = this._form();
    if (!f) throw new Error('Form not set before read');
    return f;
  });
  readonly selectedId = signal<string | null>(null);
  readonly activePageId = signal<string | null>(null);
  /** Optional reference form (imported) read-only compare. */
  readonly dirty = signal(false);
  /** Last failed element or option edit, read and cleared by the property panel. */
  readonly patchError = signal<PatchError | null>(null);

  readonly selectedElement = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return getElement(this.form(), id) ?? null;
  });

  readonly activePage = computed(() => {
    const pg = this.activePageId();
    return this.form().pages.find((p) => p.id === pg) ?? this.form().pages[0] ?? null;
  });

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  /** Tail of the server-side creation queue; see `createOnServer`. */
  private creations: Promise<unknown> = Promise.resolve();
  /** Edits not yet sent, by `elementKey` / `optionKey`; see `queuePatch`. */
  private readonly patches = new Map<string, PendingPatch>();

  constructor() {
    void this.hydrate();
    // Edits wait a moment before they are sent; don't lose them when the tab closes.
    const flush = () => this.flushPatches();
    window.addEventListener('pagehide', flush);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('pagehide', flush));
  }

  async hydrate(): Promise<void> {
    const { data: parsed, error } = catchFn(() => {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? parseFormData(raw).data : null;
    });
    if (parsed && Array.isArray(parsed.pages)) {
      this._form.set(parsed);
      this.schedulePersist();
    } else {
      console.warn('designer: stored form failed validation', error);
    }
  }

  /** The direct children of a page or group of the current form. */
  childrenOf(parent: ElementParent): ElementDefinition[] {
    return childrenOf(this.form(), parent);
  }

  // ---- actions ---------------------------------------------------------------

  async createEmpty(): Promise<void> {
    const form = await this.repository.newForm(this.i18n.t('builder.pageN', { n: 1 }));
    this._form.set(form);
    this.selectedId.set(null);
    this.dirty.set(false);
    this.patchError.set(null);
    this.persist();
  }

  load(def: FormDefinition): void {
    this._form.set(def);
    this.selectedId.set(null);
    this.activePageId.set(def.pages[0]?.id ?? null);
    this.dirty.set(false);
    this.patchError.set(null);
    this.persist();
  }

  rename(name: string): void {
    this.patchForm({ name });
  }

  updateSettings(patch: Partial<FormSettings>): void {
    this.patchForm({ settings: { ...this.form().settings, ...patch } });
  }

  /** Creates a page on the server (which persists it) and appends it locally. */
  async addPage(): Promise<PageDefinition> {
    const page = await this.createOnServer((form) =>
      this.repository.addPage(form.id, this.i18n.t('builder.pageN', { n: form.pages.length + 1 })),
    );
    this.applyServerChange((f) => addPage(f, page));
    this.activePageId.set(page.id);
    return page;
  }

  /** Clones a page on the server (which persists it) and appends it locally. */
  async clonePage(pageId: string): Promise<PageDefinition | undefined> {
    const suffix = this.i18n.t('builder.copySuffix');
    const clone = await this.createOnServer((form) =>
      this.repository.clonePage(form.id, pageId, suffix),
    );
    this.applyServerChange((f) => addPage(f, clone.page, clone.elements));
    this.activePageId.set(clone.page.id);
    this.selectedId.set(null);
    return clone.page;
  }

  async removePage(pageId: string) {
    const page = this.form().pages.find((p) => p.id === pageId);
    const ids = page?.children.flatMap((id) => subtreeIds(this.form(), id)) ?? [];
    await this.withoutPatchesOf(ids, () => this.repository.deletePage(this.form().id, pageId));
    this.applyServerChange((f) => removePage(f, pageId));
    const pages = this.form().pages;
    if (this.activePageId() === pageId) this.activePageId.set(pages[0]?.id ?? null);
  }

  updatePage(pageId: string, patch: Partial<PageDefinition>): void {
    this.patchForm({
      pages: this.form().pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)),
    });
  }

  /**
   * Creates an element on the server (which persists it) inside the page or group
   * `parentId`, after `afterId` or at the end, and inserts it at the same spot locally.
   */
  async addElement(
    parentId: string,
    type: ElementType,
    label?: string,
    afterId: string | null = null,
  ): Promise<ElementDefinition> {
    const el = await this.createOnServer((form) =>
      this.repository.addElement(form.id, {
        type,
        label: label ?? this.i18n.t(`q.${type}`),
        parentId,
        afterId,
        defaults: {
          option: this.i18n.t('panel.option'),
          scaleMin: this.i18n.t('builder.scaleMin'),
          scaleMax: this.i18n.t('builder.scaleMax'),
        },
      }),
    );
    // The tree may have changed during the request: if `afterId` is gone, append instead.
    // If the parent itself is gone, its removal was sent to the server too, so skip it.
    let inserted = false;
    this.applyServerChange((f) => {
      const next = insertElement(f, parentId, afterId, el) ?? insertElement(f, parentId, null, el);
      inserted = next !== null;
      return next ?? f;
    });
    if (inserted) this.selectedId.set(el.id);
    return el;
  }

  /**
   * Applies an element edit locally right away (see `patchElement`; an undefined field
   * is removed) and sends it to the server shortly after, merged with further edits of
   * the same element, so typing a label sends one request rather than one per key.
   */
  updateElement(elementId: ElementId, patch: ElementPatch): void {
    const request = toElementPatch(patch);
    this.applyServerChange((f) => patchElement(f, elementId, request));
    this.queuePatch(
      elementKey(elementId),
      elementId,
      request,
      'panel.patchElementFailed',
      (formId, merged, keepalive) =>
        this.repository.updateElement(formId, elementId, merged, { keepalive }),
    );
  }

  /** Reorders the options of a choice element locally and marks the form dirty. */
  moveOption(elementId: ElementId, index: number, dir: -1 | 1): void {
    const el = getElement(this.form(), elementId);
    if (!el || !isChoice(el)) return;
    const target = index + dir;
    if (target < 0 || target >= el.options.length) return;
    const options = [...el.options];
    const [item] = options.splice(index, 1);
    options.splice(target, 0, item);
    this.patchDocument(updateElement(this.form(), elementId, { options }));
  }

  /**
   * Creates an option on the server (which persists it) for the choice element
   * `elementId` and appends it locally. Skipped locally if the element is gone by then.
   */
  async addOption(elementId: string, label: string): Promise<ChoiceOption> {
    const option = await this.createOnServer((form) =>
      this.repository.addOption(form.id, elementId, { label }),
    );
    this.applyServerChange((f) => updateOptions(f, elementId, (options) => [...options, option]));
    return option;
  }

  /**
   * Creates a validation rule on the server (which persists it) for the question
   * `elementId` and appends it locally. Skipped locally if the element is gone by then.
   */
  async addValidationRule(
    elementId: ElementId,
    request: CreateValidationRuleRequest,
  ): Promise<ValidationRule> {
    const rule = await this.createOnServer((form) =>
      this.repository.addValidationRule(form.id, elementId, request),
    );
    this.applyServerChange((f) => updateValidations(f, elementId, (rules) => [...rules, rule]));
    return rule;
  }

  /**
   * Applies a validation rule edit locally right away and sends it to the server. Rule
   * inputs commit on `change`, so each edit is one request. If the server rejects the
   * edit (400), it is reverted locally so no later save carries it. If it fails otherwise
   * while the form is still loaded, the form is marked dirty so the next save carries it.
   */
  async patchValidationRule(
    elementId: ElementId,
    ruleId: string,
    patch: UpdateValidationRuleRequest,
  ): Promise<void> {
    const formId = this.form().id;
    let previous: ValidationRule | undefined;
    this.applyServerChange((f) =>
      updateValidations(f, elementId, (rules) =>
        rules.map((r) => {
          if (r.id !== ruleId) return r;
          previous = r;
          return { ...r, ...patch };
        }),
      ),
    );
    try {
      await this.createOnServer((form) =>
        this.repository.updateValidationRule(form.id, elementId, ruleId, patch),
      );
    } catch (error) {
      if (this._form()?.id === formId) {
        if (error instanceof ApiError && error.status === 400 && previous) {
          this.revertRuleEdit(elementId, ruleId, patch, previous);
        } else {
          this.dirty.set(true);
        }
      }
      throw error;
    }
  }

  /** Deletes a validation rule on the server, then removes it locally. */
  async removeValidationRule(elementId: ElementId, ruleId: string): Promise<void> {
    await this.createOnServer((form) =>
      this.repository.deleteValidationRule(form.id, elementId, ruleId),
    );
    this.applyServerChange((f) =>
      updateValidations(f, elementId, (rules) => rules.filter((r) => r.id !== ruleId)),
    );
  }

  /**
   * Applies an option edit locally right away and sends it to the server shortly after,
   * merged with further edits of the same option, so typing sends one request rather
   * than one per key.
   */
  patchOption(elementId: ElementId, optionId: string, patch: UpdateOptionRequest): void {
    this.applyServerChange((f) =>
      updateOptions(f, elementId, (options) =>
        options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)),
      ),
    );
    this.queuePatch(
      optionKey(elementId, optionId),
      elementId,
      patch,
      'panel.patchOptionFailed',
      (formId, merged, keepalive) =>
        this.repository.updateOption(formId, elementId, optionId, merged, { keepalive }),
    );
  }

  /**
   * Deletes an option on the server, dropping any unsent edit of it, then removes it
   * locally. If the deletion fails, the unsent edit is sent after all.
   */
  async removeOption(elementId: ElementId, optionId: string): Promise<void> {
    const key = optionKey(elementId, optionId);
    await this.withoutPatches(
      (k) => k === key,
      () =>
        this.createOnServer((form) => this.repository.deleteOption(form.id, elementId, optionId)),
    );
    this.applyServerChange((f) =>
      updateOptions(f, elementId, (options) => options.filter((o) => o.id !== optionId)),
    );
  }

  async removeElement(elementId: string) {
    await this.withoutPatchesOf(subtreeIds(this.form(), elementId), () =>
      this.repository.deleteElement(this.form().id, elementId),
    );
    this.applyServerChange((f) => removeElement(f, elementId));
    if (this.selectedId() === elementId) this.selectedId.set(null);
  }

  /** Moves an element one step up or down (see `moveElement`); as `moveElementTo`. */
  async moveElement(elementId: string, direction: -1 | 1): Promise<void> {
    const before = this.form();
    const next = moveElement(before, elementId, direction);
    if (next !== before) await this.sendMove(elementId, before, next);
  }

  /**
   * Move an element to an arbitrary position of an arbitrary container (a page or
   * a group), wherever it currently lives. Applies the move locally right away and
   * sends it to the server; if that fails, the element moves back.
   *
   * `index` follows CDK drop semantics: it is resolved against the destination
   * array *after* the element has been detached from its source, so the same
   * value works for both reorders and transfers.
   */
  async moveElementTo(elementId: string, parentId: string, index: number): Promise<void> {
    const before = this.form();
    const next = moveElementTo(before, elementId, parentId, index);
    if (next) await this.sendMove(elementId, before, next);
  }

  /**
   * Duplicates an element on the server (which persists it) right after the
   * original and inserts the returned copy at the same spot locally.
   */
  async duplicateElement(elementId: string): Promise<ElementDefinition | undefined> {
    const suffix = this.i18n.t('builder.copySuffix');
    const clone = await this.createOnServer((form) =>
      this.repository.cloneElement(form.id, elementId, suffix),
    );
    let copy: ElementDefinition | undefined;
    this.applyServerChange((f) => {
      // The tree may have changed during the request. If the source is gone,
      // skip the copy locally (as with other server-side creations).
      const parent = parentOf(f, elementId);
      if (!parent) return f;
      const next = insertElement(f, parent.id, elementId, clone.element, clone.subtree);
      if (next) copy = clone.element;
      return next ?? f;
    });
    if (copy) this.selectedId.set(copy.id);
    return copy;
  }

  /** Selects an element; unsent edits of the one selected before are sent right away. */
  select(id: string | null): void {
    const previous = this.selectedId();
    if (previous && previous !== id) this.sendEditsOf(previous);
    this.selectedId.set(id);
  }

  /** Sends the unsent edits of the element `elementId` and its options right away. */
  sendEditsOf(elementId: ElementId): void {
    for (const [key, pending] of [...this.patches]) {
      if (pending.elementId === elementId) void this.sendPatch(key);
    }
  }

  selectPage(id: string): void {
    if (this.form().pages.find((page) => page.id === id)) this.activePageId.set(id);
  }

  // ---- internals -------------------------------------------------------------

  private patchDocument({ pages, elements }: FormDocument): void {
    this.patchForm({ pages, elements });
  }

  private patchForm(patch: Partial<SaveFormDefinition>): void {
    this._form.update((f) => {
      if (!f) throw new Error('Form not set in store before update');
      return {
        ...f,
        ...patch,
      };
    });
    this.dirty.set(true);
    this.persist();
  }

  /**
   * Queues a server-side creation or removal for the form that is loaded now, after
   * every unsent edit, so e.g. a copy carries a label typed just before. Rejects
   * instead of sending or applying it once another form has been loaded in the meantime.
   */
  private createOnServer<T>(create: (form: FormDefinition) => Promise<T>): Promise<T> {
    for (const key of [...this.patches.keys()]) void this.sendPatch(key);
    const formId = this.form().id;
    const assertSameForm = () => {
      if (this._form()?.id !== formId) throw new Error('designer: form changed during creation');
    };
    const run = this.creations.then(async () => {
      assertSameForm();
      await this.saveIfDirty();
      assertSameForm();
      const result = await create(this.form());
      assertSameForm();
      return result;
    });
    this.creations = run.catch(() => undefined);
    return run;
  }

  /**
   * Applies the move of `elementId` from `before` to `next` and sends it through the
   * creation queue. On failure it moves the element back if this form is still loaded.
   */
  private async sendMove(
    elementId: ElementId,
    before: FormDefinition,
    next: FormDefinition,
  ): Promise<void> {
    const from = parentOf(before, elementId);
    const to = parentOf(next, elementId);
    if (!from || !to) return;
    const fromIndex = from.children.indexOf(elementId);
    const index = to.children.indexOf(elementId);
    const formId = before.id;
    this.applyServerChange(() => next);
    try {
      await this.createOnServer((form) =>
        this.repository.moveElement(form.id, elementId, { parentId: to.id, index }),
      );
    } catch (error) {
      if (this._form()?.id === formId) {
        this.applyServerChange((f) => moveElementTo(f, elementId, from.id, fromIndex) ?? f);
      }
      throw error;
    }
  }

  /**
   * Queues the edit `patch` of the element `elementId` (or one of its options) under
   * `key`, merged with an unsent earlier edit of the same key, and sends it with `send`
   * once no further edit arrives for `PATCH_DELAY_MS`.
   */
  private queuePatch<P extends object>(
    key: string,
    elementId: ElementId,
    patch: P,
    failed: TranslationKey,
    send: (formId: string, patch: P, keepalive: boolean) => Promise<unknown>,
  ): void {
    const pending = this.patches.get(key);
    if (pending) clearTimeout(pending.timer);
    const formId = pending?.formId ?? this.form().id;
    // A key always stands for the same kind of edit, so the earlier patch is a `P` too.
    const merged: P = { ...(pending?.patch as P | undefined), ...patch };
    this.schedulePatch(key, {
      formId,
      elementId,
      patch: merged,
      failed,
      send: (keepalive) => send(formId, merged, keepalive),
    });
  }

  private schedulePatch(key: string, pending: Omit<PendingPatch, 'timer'>): void {
    this.patches.set(key, {
      ...pending,
      timer: setTimeout(() => void this.sendPatch(key), PATCH_DELAY_MS),
    });
  }

  /**
   * Sends the pending edit `key` through the creation queue. Unlike creations it is
   * still sent after another form has been loaded, since it is already applied there.
   * If it fails while its form is loaded, the form is marked dirty so the next save
   * carries it.
   */
  private sendPatch(key: string): Promise<void> {
    const pending = this.patches.get(key);
    if (!pending) return Promise.resolve();
    clearTimeout(pending.timer);
    this.patches.delete(key);
    return this.enqueuePatch(pending);
  }

  /** Sends `pending` through the creation queue; see `sendPatch`. */
  private enqueuePatch(pending: PendingPatch): Promise<void> {
    const isLoaded = () => this._form()?.id === pending.formId;
    const run = this.creations
      .then(async () => {
        if (isLoaded()) await this.saveIfDirty();
        await pending.send(false);
      })
      .catch((error: unknown) => {
        if (!isLoaded()) return;
        this.dirty.set(true);
        this.patchError.set({ error, message: pending.failed });
      });
    this.creations = run;
    return run;
  }

  /**
   * Sends every unsent edit right away, past the creation queue and with `keepalive`,
   * so it still reaches the server while the page is being closed.
   */
  private flushPatches(): void {
    for (const [key, pending] of this.patches) {
      clearTimeout(pending.timer);
      this.patches.delete(key);
      void pending.send(true).catch(() => undefined);
    }
  }

  /**
   * Runs `remove` with the unsent edits whose key passes `drop` taken out of the queue,
   * since they would fail once their target is gone. If `remove` fails, they are sent
   * after all.
   */
  private async withoutPatches(
    drop: (key: string, pending: PendingPatch) => boolean,
    remove: () => Promise<void>,
  ): Promise<void> {
    const taken = [...this.patches].filter(([key, pending]) => drop(key, pending));
    for (const [key, pending] of taken) {
      clearTimeout(pending.timer);
      this.patches.delete(key);
    }
    try {
      await remove();
    } catch (error) {
      // Ahead of any newer edit of the same key, which is still waiting for its timer.
      for (const [, pending] of taken) void this.enqueuePatch(pending);
      throw error;
    }
  }

  /** `withoutPatches` for every unsent edit of the elements `elementIds` and their options. */
  private withoutPatchesOf(elementIds: ElementId[], remove: () => Promise<void>): Promise<void> {
    const ids = new Set(elementIds);
    return this.withoutPatches((_key, pending) => ids.has(pending.elementId), remove);
  }

  /**
   * Restores the fields of a rejected rule edit to `previous`, but only those that still
   * hold the rejected value, so edits made since are kept.
   */
  private revertRuleEdit(
    elementId: ElementId,
    ruleId: string,
    patch: UpdateValidationRuleRequest,
    previous: ValidationRule,
  ): void {
    const fields = Object.keys(patch) as (keyof UpdateValidationRuleRequest)[];
    this.applyServerChange((f) =>
      updateValidations(f, elementId, (rules) =>
        rules.map((r) => {
          if (r.id !== ruleId) return r;
          const reverted: ValidationRule = { ...r };
          for (const field of fields) {
            if (r[field] === patch[field]) Object.assign(reverted, { [field]: previous[field] });
          }
          return reverted;
        }),
      ),
    );
  }

  /** Saves unsaved edits, so the server knows everything a following change refers to. */
  private async saveIfDirty(): Promise<void> {
    if (!this.dirty()) return;
    const snapshot = this.form();
    await this.repository.saveForm(snapshot);
    // Edits made while the save was in flight are still unsaved.
    if (this.form() === snapshot) this.dirty.set(false);
  }

  /** Applies a change the server already persisted, without marking the form dirty. */
  private applyServerChange(change: (form: FormDefinition) => FormDefinition): void {
    this._form.update((f) => {
      if (!f) throw new Error('Form not set in store before update');
      return change(f);
    });
    this.persist();
  }

  private persist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      catchFn(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(this.form())));
    }, 150);
  }

  private schedulePersist(): void {
    this.persist();
  }
}
