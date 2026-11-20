import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { isChoice, isQuestion } from '@shared/helper';
import {
  addPage,
  type ElementPatch,
  type FormPatch,
  insertElement,
  moveElement,
  moveElementTo,
  moveOptionTo,
  type PagePatch,
  patchElement,
  patchForm,
  patchPage,
  removeElement,
  removePage,
  updateElement,
} from '@shared/model/form-ops';
import {
  childrenOf,
  type ElementParent,
  type FormDocument,
  getElement,
  getParent,
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
} from '@shared/model/form.model';
import type { ElementId, PageId } from '@shared/model/ids';
import type { ValidationRule } from '@shared/model/validation.model';
import {
  type CreateValidationRuleRequest,
  type UpdateOptionRequest,
  type UpdateValidationRuleRequest,
} from '@shared/schemas';
import * as z from 'zod/mini';
import { I18nService, type TranslationKey } from '../i18n/translation.service';
import { ApiError } from './api-error';
import { FormsRepository } from './forms.repository';

/**
 * How long an edit waits for further edits of the same element or page before it is
 * sent, so e.g. changing the label and description and ticking "required" is one
 * request. Each edit restarts the wait; leaving the element or page sends at once
 * (see `select`, `selectPage`).
 */
export const PATCH_DELAY_MS = 3000;

/**
 * How long to wait before each further attempt of an edit that failed for a passing
 * reason (see `isTransient`). Once they are used up, the edit counts as failed.
 */
export const RETRY_DELAYS_MS = [1000, 5000, 15000];

/**
 * Whether a request may succeed when sent again: no answer, or the server was busy or
 * failing. Not if its answer came complete but didn't match the expected schema, which
 * a further one would do just the same.
 */
function isTransient(error: unknown): boolean {
  if (error instanceof z.core.$ZodError) return false;
  if (!(error instanceof ApiError)) return true;
  return error.status >= 500 || error.status === 408 || error.status === 429;
}

/**
 * Runs `send`, and again after each of `RETRY_DELAYS_MS` while it fails for a transient
 * reason. Only for requests that may arrive twice, such as an edit setting fields.
 */
async function withRetries<T>(send: () => Promise<T>): Promise<T> {
  for (const delay of RETRY_DELAYS_MS) {
    try {
      return await send();
    } catch (error) {
      if (!isTransient(error)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return await send();
}

/**
 * The fields of one element, page or option, or of the form itself, that were changed
 * locally but the server doesn't have yet; see `queueEdit`. Only which fields changed is
 * kept: their values are read from the local form when they are sent, so the latest
 * value always wins, and a send that fails just leaves its fields changed.
 */
interface FieldEdits {
  key: string;
  formId: string;
  /** The element or page the fields belong to; see `removeWithEdits`. */
  targetId: ElementId | PageId;
  /** The fields changed since they were last sent. */
  fields: Set<string>;
  /** The request for `fields` as `form` has them; undefined once the target is gone. */
  build: (form: FormDefinition, fields: string[]) => object | undefined;
  /** `form` with a request of `build` applied; see `replaceForm`. */
  apply: (form: FormDefinition, request: object) => FormDefinition;
  send: (patch: object, keepalive: boolean) => Promise<unknown>;
  /**
   * The fields of the send in flight (sends of an edit run one after another in the
   * creation queue); changed again if it fails.
   */
  sending: Set<string>;
  /** Shown when sending fails. */
  message: TranslationKey;
  /** Sends the fields once no further edit arrives; set while they wait. */
  timer?: ReturnType<typeof setTimeout>;
  /** How many sends of them wait in the creation queue; see `sendEdit`. */
  queued: number;
  /** Sending failed, and nothing waiting or queued takes the fields along; see `unsaved`. */
  failed: boolean;
  /** The form as it was when another one was loaded; the fields are read from it then. */
  snapshot?: FormDefinition;
}

/**
 * The `fields` of `target` as a request. With `nulls`, a field that is not there is sent
 * as null, which removes it (JSON has no undefined; see `ElementPatch`, `PagePatch`).
 */
function pick(target: object, fields: string[], nulls: boolean): Record<string, unknown> {
  const values = target as Record<string, unknown>;
  return Object.fromEntries(
    fields.map((field) => [field, values[field] === undefined && nulls ? null : values[field]]),
  );
}

/** Prefix of a changed form setting in `FieldEdits.fields`, e.g. `settings.navigation`. */
const SETTING = 'settings.';

/** The form's own `fields` as a request; settings are sent field by field. */
function formRequest(form: FormDefinition, fields: string[]): FormPatch {
  const request = pick(
    form,
    fields.filter((field) => !field.startsWith(SETTING)),
    false,
  ) as FormPatch;
  const settings = fields.filter((f) => f.startsWith(SETTING)).map((f) => f.slice(SETTING.length));
  if (settings.length > 0) request.settings = pick(form.settings, settings, false);
  return request;
}

/**
 * A move of an element or of a choice option, applied locally but its request hasn't
 * succeeded yet; see `sendMove`. `before` lists the siblings it followed, nearest last,
 * so it goes back to the same spot even when the nearest of them has been removed meanwhile.
 */
type UnconfirmedMove =
  | {
      kind: 'element';
      elementId: ElementId;
      /** The page or group the element was moved out of. */
      fromId: string;
      before: ElementId[];
    }
  | {
      kind: 'option';
      /** The choice element the option belongs to. */
      elementId: ElementId;
      optionId: string;
      before: string[];
    };

/** The index right after the last of `before` that is in `siblings`, or 0. */
function indexAfter(siblings: readonly string[], before: readonly string[]): number {
  const after = before.findLast((id) => siblings.includes(id));
  return after === undefined ? 0 : siblings.indexOf(after) + 1;
}

/**
 * `form` with `moves` (oldest first) taken back, newest first. Each element or option
 * goes back right after the nearest of its former preceding siblings still there, or first.
 */
function undoMoves<T extends FormDocument>(form: T, moves: readonly UnconfirmedMove[]): T {
  return moves.reduceRight((f, move) => {
    if (move.kind === 'option') {
      const el = getElement(f, move.elementId);
      const siblings =
        el && isChoice(el) ? el.options.map((o) => o.id).filter((id) => id !== move.optionId) : [];
      const index = indexAfter(siblings, move.before);
      return moveOptionTo(f, move.elementId, move.optionId, index) ?? f;
    }
    const siblings =
      getParent(f, move.fromId)?.children.filter((id) => id !== move.elementId) ?? [];
    return moveElementTo(f, move.elementId, move.fromId, indexAfter(siblings, move.before)) ?? f;
  }, form);
}

/** A failed edit, read and cleared by the property panel to show a message. */
export interface PatchError {
  error: unknown;
  message: TranslationKey;
}

// Edit keys include the form: an imported copy keeps the element, page and option ids.

function optionKey(formId: string, elementId: ElementId, optionId: string): string {
  return `option:${formId}/${elementId}/${optionId}`;
}

function elementKey(formId: string, elementId: ElementId): string {
  return `element:${formId}/${elementId}`;
}

function formKey(formId: string): string {
  return `form:${formId}`;
}

function pageKey(formId: string, pageId: string): string {
  return `page:${formId}/${pageId}`;
}

function ruleKey(formId: string, elementId: ElementId, ruleId: string): string {
  return `rule:${formId}/${elementId}/${ruleId}`;
}

/** `patch` with every undefined field set to null, so applying it removes the field. */
function withNulls<P extends ElementPatch | PagePatch>(patch: P): P {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [key, value === undefined ? null : value]),
  ) as P;
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
  /** Last failed element or option edit, read and cleared by the property panel. */
  readonly patchError = signal<PatchError | null>(null);
  /** How many edits of the loaded form failed; see `failed`. */
  private readonly failedCount = signal(0);
  /**
   * How many edits (element, option, page, form and validation rule edits) are in the
   * creation queue, waiting, being sent or retried; see `whileSending`.
   */
  private readonly sendingCount = signal(0);
  /** Leaving was interrupted while edits were still being sent; see `interruptLeave`. */
  private readonly closeInterrupted = signal(false);
  /**
   * Whether edits of the loaded form failed to reach the server even after retrying, so
   * it differs from the stored form (see `retryFailed`), or haven't reached it yet while
   * the builder is being left (see `interruptLeave`).
   */
  readonly unsaved = computed(
    () => this.failedCount() > 0 || (this.closeInterrupted() && this.sendingCount() > 0),
  );

  readonly selectedElement = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return getElement(this.form(), id) ?? null;
  });

  readonly activePage = computed(() => {
    const pg = this.activePageId();
    return this.form().pages.find((p) => p.id === pg) ?? this.form().pages[0] ?? null;
  });

  /** Tail of the server-side creation queue; see `createOnServer`. */
  private creations: Promise<unknown> = Promise.resolve();
  /** Changed fields the server doesn't have yet, by `elementKey`, `optionKey`, …; see `queueEdit`. */
  private readonly edits = new Map<string, FieldEdits>();
  /**
   * Moves applied locally but not confirmed by the server, oldest first. They are sent
   * one after another through the creation queue, so the first is the one in flight.
   */
  private unconfirmedMoves: UnconfirmedMove[] = [];

  constructor() {
    // Edits wait a moment before they are sent; don't lose them when the tab closes.
    const flush = () => this.flushPatches();
    const warn = (event: BeforeUnloadEvent) => this.warnOnClose(event);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', warn);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', warn);
    });
  }

  /**
   * Whether leaving the builder now would lose edits, because they failed or are still
   * being sent; if so, shows them as `unsaved` right away. Edits still waiting for
   * `PATCH_DELAY_MS` are not counted: closing the page sends them (see `flushPatches`),
   * and leaving the route should `sendPending` first, so they count as being sent.
   */
  interruptLeave(): boolean {
    if (this.failedCount() === 0 && this.sendingCount() === 0) return false;
    // Failed edits are unsaved anyway; the flag is reset only once sending finishes.
    if (this.sendingCount() > 0) this.closeInterrupted.set(true);
    return true;
  }

  /**
   * Asks the browser to confirm closing the page (see `interruptLeave`), also while edits
   * wait: they are sent on `pagehide`, but whether that arrives is never known, and
   * nothing keeps them for the next visit (`navigator.onLine` doesn't tell whether the
   * server is reachable).
   */
  private warnOnClose(event: BeforeUnloadEvent): void {
    const waiting = [...this.edits.values()].some((edit) => edit.timer);
    if (this.interruptLeave() || waiting) {
      event.preventDefault();
      // Safari and older browsers ask only once a return value is set.
      event.returnValue = true;
    }
  }

  /** The direct children of a page or group of the current form. */
  childrenOf(parent: ElementParent): ElementDefinition[] {
    return childrenOf(this.form(), parent);
  }

  // ---- actions ---------------------------------------------------------------

  load(def: FormDefinition): void {
    this.replaceForm(def);
    this.activePageId.set(def.pages[0]?.id ?? null);
  }

  /**
   * Loads `form` and forgets the state of the one loaded before: its failed edits are
   * dropped, the others are still sent, read from it as it was (see `FieldEdits.snapshot`).
   * A fresh copy of a form with edits still waiting or in flight may lack them, so their
   * values are applied to it again; its other fields stay as loaded.
   */
  private replaceForm(form: FormDefinition): void {
    const previous = this._form();
    let next = form;
    for (const edit of [...this.edits.values()]) {
      if (edit.failed) {
        this.edits.delete(edit.key);
        continue;
      }
      const source = edit.formId === previous?.id ? previous : edit.snapshot;
      if (edit.formId === form.id) {
        const fields = [...new Set([...edit.fields, ...edit.sending])];
        const request = source && fields.length > 0 ? edit.build(source, fields) : undefined;
        if (request) next = edit.apply(next, request);
        edit.snapshot = undefined;
      } else if (edit.formId === previous?.id) {
        edit.snapshot = previous;
      }
    }
    this._form.set(next);
    this.selectedId.set(null);
    this.patchError.set(null);
    this.updateUnsaved();
    this.unconfirmedMoves = [];
  }

  rename(name: string): void {
    this.updateForm({ name });
  }

  updateSettings(settings: Partial<FormSettings>): void {
    this.updateForm({ settings });
  }

  /**
   * Applies an edit of the form's own fields locally right away and sends it to the
   * server shortly after, together with further edits of them (settings field by field).
   */
  private updateForm(patch: FormPatch): void {
    const formId = this.form().id;
    this.applyServerChange((f) => patchForm(f, patch));
    const { settings, ...own } = patch;
    this.queueEdit(
      formKey(formId),
      formId,
      [...Object.keys(own), ...Object.keys(settings ?? {}).map((field) => SETTING + field)],
      'builder.patchFormFailed',
      formRequest,
      patchForm,
      (id, request, keepalive) => this.repository.updateForm(id, request, { keepalive }),
    );
  }

  /** Creates a page on the server (which persists it) and appends it locally. */
  async addPage(): Promise<PageDefinition> {
    const page = await this.createOnServer(
      (form) =>
        this.repository.addPage(
          form.id,
          this.i18n.t('builder.pageN', { n: form.pages.length + 1 }),
        ),
      (created) => this.applyServerChange((f) => addPage(f, created)),
    );
    this.activePageId.set(page.id);
    return page;
  }

  /**
   * Clones a page on the server (which persists it) and appends it locally; refused
   * while edits of the page or its elements are unsaved (see `createCopyOnServer`).
   */
  async clonePage(pageId: string): Promise<PageDefinition | undefined> {
    const suffix = this.i18n.t('builder.copySuffix');
    const clone = await this.createCopyOnServer(
      (form) => [
        pageId,
        ...(form.pages
          .find((p) => p.id === pageId)
          ?.children.flatMap((id) => subtreeIds(form, id)) ?? []),
      ],
      (form) => this.repository.clonePage(form.id, pageId, suffix),
      ({ page, elements }) => this.applyServerChange((f) => addPage(f, page, elements)),
    );
    this.activePageId.set(clone.page.id);
    this.selectedId.set(null);
    return clone.page;
  }

  async removePage(pageId: string) {
    const form = this.form();
    const removed = new Set<string>([
      pageId,
      ...(form.pages.find((p) => p.id === pageId)?.children.flatMap((id) => subtreeIds(form, id)) ??
        []),
    ]);
    await this.removeWithEdits(
      (edit) => removed.has(edit.targetId),
      (f) => this.repository.deletePage(f.id, pageId),
      () => this.applyServerChange((f) => removePage(f, pageId)),
    );
    const pages = this.form().pages;
    if (this.activePageId() === pageId) this.activePageId.set(pages[0]?.id ?? null);
  }

  /**
   * Applies a page edit locally right away and sends it to the server shortly after,
   * together with further edits of the same page. A condition set to undefined is
   * removed; an undefined title or subtitle is left as it is (pages always have them).
   */
  updatePage(pageId: string, patch: PagePatch): void {
    const change: PagePatch = {};
    if (patch.title !== undefined) change.title = patch.title;
    if (patch.subtitle !== undefined) change.subtitle = patch.subtitle;
    if ('enabledWhen' in patch) change.enabledWhen = patch.enabledWhen ?? null;
    this.applyServerChange((f) => patchPage(f, pageId, change));
    this.queueEdit(
      pageKey(this.form().id, pageId),
      pageId,
      Object.keys(change),
      'canvas.patchPageFailed',
      (form, fields) => {
        const page = form.pages.find((p) => p.id === pageId);
        if (!page) return undefined;
        const request = pick(page, fields, false) as PagePatch;
        if (fields.includes('enabledWhen')) request.enabledWhen = page.enabledWhen ?? null;
        return request;
      },
      (form, request) => patchPage(form, pageId, request),
      (formId, request, keepalive) =>
        this.repository.updatePage(formId, pageId, request, { keepalive }),
    );
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
    let inserted = false;
    const el = await this.createOnServer(
      (form) =>
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
      // The tree may have changed during the request: if `afterId` is gone, append
      // instead. If the parent itself is gone, its removal was sent too, so skip it.
      (created) =>
        this.applyServerChange((f) => {
          const next =
            insertElement(f, parentId, afterId, created) ??
            insertElement(f, parentId, null, created);
          inserted = next !== null;
          return next ?? f;
        }),
    );
    if (inserted) this.selectedId.set(el.id);
    return el;
  }

  /**
   * Applies an element edit locally right away (see `patchElement`; an undefined field
   * is removed) and sends it to the server shortly after, together with further edits
   * of the same element, so typing a label sends one request rather than one per key.
   */
  updateElement(elementId: ElementId, patch: ElementPatch): void {
    this.applyServerChange((f) => patchElement(f, elementId, withNulls(patch)));
    this.queueEdit(
      elementKey(this.form().id, elementId),
      elementId,
      Object.keys(patch),
      'panel.patchElementFailed',
      (form, fields) => {
        const el = getElement(form, elementId);
        return el && (pick(el, fields, true) as ElementPatch);
      },
      (form, request) => patchElement(form, elementId, request),
      (formId, request, keepalive) =>
        this.repository.updateElement(formId, elementId, request, { keepalive }),
    );
  }

  /**
   * Moves the option at `index` of a choice element one step up (-1) or down (1).
   * Applies it locally right away and sends it to the server; if that fails, the
   * option moves back (see `sendMove`).
   */
  async moveOption(elementId: ElementId, index: number, dir: -1 | 1): Promise<void> {
    const el = getElement(this.form(), elementId);
    if (!el || !isChoice(el)) return;
    const option = el.options[index];
    const target = index + dir;
    if (!option || target < 0 || target >= el.options.length) return;
    const next = moveOptionTo(this.form(), elementId, option.id, target);
    if (!next) return;
    await this.sendMove(
      {
        kind: 'option',
        elementId,
        optionId: option.id,
        before: el.options.slice(0, index).map((o) => o.id),
      },
      next,
      (settled) => {
        const current = getElement(settled, elementId);
        const at =
          current && isChoice(current) ? current.options.findIndex((o) => o.id === option.id) : -1;
        if (at < 0) return null;
        return this.repository.moveOption(settled.id, elementId, option.id, { index: at });
      },
    );
  }

  /**
   * Creates an option on the server (which persists it) for the choice element
   * `elementId` and appends it locally. Skipped locally if the element is gone by then.
   */
  async addOption(elementId: string, label: string): Promise<ChoiceOption> {
    return await this.createOnServer(
      (form) => this.repository.addOption(form.id, elementId, { label }),
      (option) =>
        this.applyServerChange((f) =>
          updateOptions(f, elementId, (options) => [...options, option]),
        ),
    );
  }

  /**
   * Creates a validation rule on the server (which persists it) for the question
   * `elementId` and appends it locally. Skipped locally if the element is gone by then.
   */
  async addValidationRule(
    elementId: ElementId,
    request: CreateValidationRuleRequest,
  ): Promise<ValidationRule> {
    return await this.createOnServer(
      (form) => this.repository.addValidationRule(form.id, elementId, request),
      (rule) =>
        this.applyServerChange((f) => updateValidations(f, elementId, (rules) => [...rules, rule])),
    );
  }

  /**
   * Applies a validation rule edit locally right away and sends it to the server at once,
   * as an element edit (see `queueEdit`): rule inputs commit on `change`, so there is
   * nothing to wait for. If it fails, it stays as unsaved (see `unsaved`).
   */
  patchValidationRule(
    elementId: ElementId,
    ruleId: string,
    patch: UpdateValidationRuleRequest,
  ): void {
    const apply = (form: FormDefinition, request: UpdateValidationRuleRequest) =>
      updateValidations(form, elementId, (rules) =>
        rules.map((r) => (r.id === ruleId ? { ...r, ...request } : r)),
      );
    this.applyServerChange((f) => apply(f, patch));
    const key = ruleKey(this.form().id, elementId, ruleId);
    this.queueEdit(
      key,
      elementId,
      Object.keys(patch),
      'panel.patchRuleFailed',
      (form, fields) => {
        const el = getElement(form, elementId);
        const rule =
          el && isQuestion(el) ? el.validations?.find((r) => r.id === ruleId) : undefined;
        return rule && (pick(rule, fields, false) as UpdateValidationRuleRequest);
      },
      apply,
      (formId, request) => this.repository.updateValidationRule(formId, elementId, ruleId, request),
    );
    void this.sendEdit(key);
  }

  /**
   * Deletes a validation rule on the server, dropping any unsent edit of it, then removes
   * it locally. If the deletion fails, the unsent edit is sent after all.
   */
  async removeValidationRule(elementId: ElementId, ruleId: string): Promise<void> {
    const key = ruleKey(this.form().id, elementId, ruleId);
    await this.removeWithEdits(
      (edit) => edit.key === key,
      (form) => this.repository.deleteValidationRule(form.id, elementId, ruleId),
      () =>
        this.applyServerChange((f) =>
          updateValidations(f, elementId, (rules) => rules.filter((r) => r.id !== ruleId)),
        ),
    );
  }

  /**
   * Applies an option edit locally right away and sends it to the server shortly after,
   * together with further edits of the same option, so typing sends one request rather
   * than one per key.
   */
  patchOption(elementId: ElementId, optionId: string, patch: UpdateOptionRequest): void {
    const apply = (form: FormDefinition, request: UpdateOptionRequest) =>
      updateOptions(form, elementId, (options) =>
        options.map((o) => (o.id === optionId ? { ...o, ...request } : o)),
      );
    this.applyServerChange((f) => apply(f, patch));
    this.queueEdit(
      optionKey(this.form().id, elementId, optionId),
      elementId,
      Object.keys(patch),
      'panel.patchOptionFailed',
      (form, fields) => {
        const el = getElement(form, elementId);
        const option = el && isChoice(el) ? el.options.find((o) => o.id === optionId) : undefined;
        return option && (pick(option, fields, false) as UpdateOptionRequest);
      },
      apply,
      (formId, request, keepalive) =>
        this.repository.updateOption(formId, elementId, optionId, request, { keepalive }),
    );
  }

  /**
   * Deletes an option on the server, dropping any unsent edit of it, then removes it
   * locally. If the deletion fails, the unsent edit is sent after all.
   */
  async removeOption(elementId: ElementId, optionId: string): Promise<void> {
    const key = optionKey(this.form().id, elementId, optionId);
    await this.removeWithEdits(
      (edit) => edit.key === key,
      (form) => this.repository.deleteOption(form.id, elementId, optionId),
      () =>
        this.applyServerChange((f) =>
          updateOptions(f, elementId, (options) => options.filter((o) => o.id !== optionId)),
        ),
    );
  }

  /**
   * Deletes an element on the server, dropping the unsent edits of it and everything
   * below it, then removes it locally. The deletion waits in the creation queue, so
   * edits already sent before reach the element while it still exists.
   */
  async removeElement(elementId: string) {
    const removed = new Set<string>(subtreeIds(this.form(), elementId));
    await this.removeWithEdits(
      (edit) => removed.has(edit.targetId),
      (form) => this.repository.deleteElement(form.id, elementId),
      () => this.applyServerChange((f) => removeElement(f, elementId)),
    );
    if (this.selectedId() === elementId) this.selectedId.set(null);
  }

  /** Moves an element one step up or down (see `moveElement`); as `moveElementTo`. */
  async moveElement(elementId: string, direction: -1 | 1): Promise<void> {
    const before = this.form();
    const next = moveElement(before, elementId, direction);
    if (next !== before) await this.sendElementMove(elementId, before, next);
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
    if (next) await this.sendElementMove(elementId, before, next);
  }

  /**
   * Duplicates an element on the server (which persists it) right after the
   * original and inserts the returned copy at the same spot locally; refused while
   * edits of it or below it are unsaved (see `createCopyOnServer`).
   */
  async duplicateElement(elementId: string): Promise<ElementDefinition | undefined> {
    const suffix = this.i18n.t('builder.copySuffix');
    let copy: ElementDefinition | undefined;
    await this.createCopyOnServer(
      (form) => subtreeIds(form, elementId),
      (form) => this.repository.cloneElement(form.id, elementId, suffix),
      ({ element, subtree }) =>
        this.applyServerChange((f) => {
          // The tree may have changed during the request. If the source is gone,
          // skip the copy locally (as with other server-side creations).
          const parent = parentOf(f, elementId);
          if (!parent) return f;
          const next = insertElement(f, parent.id, elementId, element, subtree);
          if (next) copy = element;
          return next ?? f;
        }),
    );
    if (copy) this.selectedId.set(copy.id);
    return copy;
  }

  /** Selects an element; unsent edits of the one selected before are sent right away. */
  select(id: string | null): void {
    const previous = this.selectedId();
    if (previous && previous !== id) this.sendEditsOf(previous);
    this.selectedId.set(id);
  }

  /** Sends the unsent edits of the element or page `id` (and its options) right away. */
  sendEditsOf(id: ElementId | PageId): void {
    for (const edit of [...this.edits.values()]) {
      if (edit.timer && edit.targetId === id) void this.sendEdit(edit.key);
    }
  }

  /** Activates a page; unsent edits of the page active before are sent right away. */
  selectPage(id: string): void {
    if (!this.form().pages.find((page) => page.id === id)) return;
    const previous = this.activePageId();
    if (previous && previous !== id) this.sendEditsOf(previous);
    this.activePageId.set(id);
  }

  /**
   * Sends every unsent edit right away and waits until everything queued has reached the
   * server or failed, also edits made meanwhile. Returns whether the server now has the
   * loaded form as shown.
   */
  async flush(): Promise<boolean> {
    let tail: Promise<unknown>;
    do {
      this.sendPending();
      tail = this.creations;
      await tail;
    } while (tail !== this.creations || [...this.edits.values()].some((edit) => edit.timer));
    return !this.unsaved();
  }

  /** Sends every waiting edit through the creation queue right away, without waiting. */
  sendPending(): void {
    this.sendWaiting();
  }

  /**
   * Waits until no edit of the form `formId` is queued or in flight any more, so the
   * server has them before the form is fetched again: once one arrived, `replaceForm`
   * no longer applies it to a fresh copy, which may have been read before it arrived.
   */
  async sent(formId: string): Promise<void> {
    const busy = () =>
      [...this.edits.values()].some(
        (edit) => edit.formId === formId && (edit.queued > 0 || edit.sending.size > 0),
      );
    while (busy()) await this.creations;
  }

  /** Sends the edits that failed (see `unsaved`) again. */
  async retryFailed(): Promise<void> {
    const failed = [...this.edits.values()].filter((edit) => edit.failed);
    for (const edit of failed) this.setFailed(edit, false);
    await Promise.all(failed.map((edit) => this.sendEdit(edit.key)));
  }

  // ---- internals -------------------------------------------------------------

  /**
   * Queues the copy `create` of the elements or pages `sources` picks, as
   * `createOnServer`. Their changed fields are sent first, so the copy carries them, also
   * those that failed before and those changed while they were sent; rejects instead of
   * copying if that fails, keeping them changed (see `deliver`).
   */
  private createCopyOnServer<T>(
    sources: (form: FormDocument) => (ElementId | PageId)[],
    create: (form: FormDefinition) => Promise<T>,
    apply: (result: T) => void,
  ): Promise<T> {
    return this.createOnServer(async (form) => {
      // As on the server: earlier moves have settled, later ones are not sent yet.
      const ids = new Set(sources(undoMoves(form, this.unconfirmedMoves)));
      const changed = () =>
        [...this.edits.values()].filter(
          (edit) => edit.formId === form.id && ids.has(edit.targetId) && edit.fields.size > 0,
        );
      // One after another, so they don't run into each other's revision on the server.
      // Counted, so leaving waits for them (see `interruptLeave`).
      const sent = await this.whileSending(async () => {
        for (let edits = changed(); edits.length > 0; edits = changed()) {
          for (const edit of edits) {
            // Sent here rather than after the copy, where its timer would send it.
            clearTimeout(edit.timer);
            edit.timer = undefined;
            if (!(await this.deliver(edit))) return false;
          }
        }
        return true;
      });
      if (this._form()?.id !== form.id) throw new Error('designer: form changed during creation');
      if (!sent) throw new Error('designer: copy source has unsaved edits');
      return create(form);
    }, apply);
  }

  /**
   * Queues a server-side creation or removal for the form that is loaded now, after
   * every unsent edit, so e.g. a copy carries a label typed just before. Once it
   * succeeded, `apply` applies its result locally, still inside the queue, so whatever is
   * queued after it (e.g. a move counting positions) sees the form as the server has it.
   * Rejects instead of sending or applying it once another form has been loaded meanwhile.
   * Edits that `keep` picks are not sent ahead of it.
   */
  private createOnServer<T>(
    create: (form: FormDefinition) => Promise<T>,
    apply?: (result: T) => void,
    keep?: (edit: FieldEdits) => boolean,
  ): Promise<T> {
    this.sendWaiting(keep);
    const formId = this.form().id;
    const assertSameForm = () => {
      if (this._form()?.id !== formId) throw new Error('designer: form changed during creation');
    };
    const run = this.creations.then(async () => {
      assertSameForm();
      const result = await create(this.form());
      assertSameForm();
      apply?.(result);
      return result;
    });
    this.creations = run.catch(() => undefined);
    return run;
  }

  /** Sends the move of `elementId` from `before` to `next`; see `sendMove`. */
  private async sendElementMove(
    elementId: ElementId,
    before: FormDefinition,
    next: FormDefinition,
  ): Promise<void> {
    const from = parentOf(before, elementId);
    if (!from || !parentOf(next, elementId)) return;
    await this.sendMove(
      {
        kind: 'element',
        elementId,
        fromId: from.id,
        before: from.children.slice(0, from.children.indexOf(elementId)),
      },
      next,
      (settled) => {
        const to = parentOf(settled, elementId);
        if (!to) return null;
        const index = to.children.indexOf(elementId);
        return this.repository.moveElement(settled.id, elementId, { parentId: to.id, index });
      },
    );
  }

  /**
   * Applies `next`, the form after `move`, and sends the move with `send` through the
   * creation queue. `send` gets the form as the server will have it after the move, so it
   * counts positions only once everything queued before has been applied, and returns
   * null when there is nothing to send any more (the element or option is gone).
   *
   * Until the server confirms it, the move counts as unconfirmed. If it fails, it is taken
   * back together with every move made after it, which may build on it and is then
   * dropped unsent, so the local order matches the server again.
   */
  private async sendMove(
    move: UnconfirmedMove,
    next: FormDefinition,
    send: (settled: FormDefinition) => Promise<unknown> | null,
  ): Promise<void> {
    this.applyServerChange(() => next);
    this.unconfirmedMoves.push(move);
    const isPending = () => this.unconfirmedMoves.includes(move);
    try {
      await this.createOnServer(async (form) => {
        // Taken back with an earlier move that failed: sending it would misplace it.
        if (!isPending()) return;
        // Earlier moves have settled by now; the later ones are not sent yet.
        const later = this.unconfirmedMoves.slice(this.unconfirmedMoves.indexOf(move) + 1);
        try {
          await send(undoMoves(form, later));
        } catch (error) {
          // Still inside the queue, so the moves after it see they were taken back.
          this.takeBackMovesFrom(move);
          throw error;
        }
        this.unconfirmedMoves = this.unconfirmedMoves.filter((m) => m !== move);
      });
    } catch (error) {
      // Failed before it was sent, e.g. the save ahead of it.
      this.takeBackMovesFrom(move);
      throw error;
    }
  }

  /**
   * Takes back the unconfirmed move `move` and every move made after it, newest first.
   * Does nothing once `move` is no longer pending (taken back already, or another form
   * was loaded).
   */
  private takeBackMovesFrom(move: UnconfirmedMove): void {
    const start = this.unconfirmedMoves.indexOf(move);
    if (start < 0) return;
    const undone = this.unconfirmedMoves.splice(start);
    this.applyServerChange((f) => undoMoves(f, undone));
  }

  /**
   * Marks `fields` of the element or page `targetId` (or one of its options or the form)
   * `key` as changed and sends them once no further edit of `key` arrives for
   * `PATCH_DELAY_MS`: `build` reads them from the form as a request, `apply` applies one
   * to a form and `send` sends it. A failed earlier edit of `key` is taken along, so it
   * is not failed any more.
   */
  private queueEdit<P extends object>(
    key: string,
    targetId: ElementId | PageId,
    fields: string[],
    message: TranslationKey,
    build: (form: FormDefinition, fields: string[]) => P | undefined,
    apply: (form: FormDefinition, request: P) => FormDefinition,
    send: (formId: string, request: P, keepalive: boolean) => Promise<unknown>,
  ): void {
    let edit = this.edits.get(key);
    if (!edit) {
      const formId = this.form().id;
      edit = {
        key,
        formId,
        targetId,
        fields: new Set(),
        build,
        // A key always stands for the same kind of edit, so the request is a `P`.
        apply: (form, request) => apply(form, request as P),
        send: (request, keepalive) => send(formId, request as P, keepalive),
        sending: new Set(),
        message,
        queued: 0,
        failed: false,
      };
      this.edits.set(key, edit);
    }
    for (const field of fields) edit.fields.add(field);
    this.setFailed(edit, false);
    clearTimeout(edit.timer);
    edit.timer = setTimeout(() => void this.sendEdit(key), PATCH_DELAY_MS);
  }

  /** Sends the waiting edits (see `queueEdit`) that `keep` doesn't pick; see `sendEdit`. */
  private sendWaiting(keep: (edit: FieldEdits) => boolean = () => false): void {
    for (const edit of [...this.edits.values()]) {
      if (edit.timer && !keep(edit)) void this.sendEdit(edit.key);
    }
  }

  /**
   * Sends the changed fields of `key` through the creation queue, as they are once it
   * gets to them (see `deliver`). Unlike creations it is still sent after another form
   * has been loaded, since the edit is already applied there.
   */
  private sendEdit(key: string): Promise<void> {
    const edit = this.edits.get(key);
    if (!edit) return Promise.resolve();
    clearTimeout(edit.timer);
    edit.timer = undefined;
    edit.queued++;
    const run = this.whileSending(() =>
      this.creations.then(async () => {
        edit.queued--;
        await this.deliver(edit);
      }),
    );
    this.creations = run;
    return run;
  }

  /**
   * Sends the changed fields of `edit` now, again while that fails for a passing reason
   * (see `withRetries`); they are dropped unsent once their target is gone. Returns
   * whether the server has them. If they still fail, they stay changed: taken along by a
   * later send of `edit` waiting or queued, or else failed (see `unsaved`) while their
   * form is loaded, and forgotten otherwise.
   */
  private async deliver(edit: FieldEdits): Promise<boolean> {
    if (this.edits.get(edit.key) !== edit) return true;
    const fields = [...edit.fields];
    const request = this.requestOf(edit, fields);
    edit.fields.clear();
    this.setFailed(edit, false);
    if (request) {
      try {
        // Read again for each attempt, so a retry doesn't overwrite a newer value sent
        // meanwhile past the queue (see `flushPatches`).
        await this.whileInFlight(edit, fields, () =>
          withRetries(async () => {
            const latest = this.requestOf(edit, fields);
            if (latest) await edit.send(latest, false);
          }),
        );
      } catch (error) {
        for (const field of fields) edit.fields.add(field);
        const isLoaded = this._form()?.id === edit.formId;
        if (isLoaded) this.patchError.set({ error, message: edit.message });
        if (edit.timer || edit.queued > 0) return false;
        if (isLoaded) {
          this.setFailed(edit, true);
        } else {
          this.edits.delete(edit.key);
        }
        return false;
      }
    }
    this.forgetIfSent(edit);
    return true;
  }

  /**
   * The request for `fields` of `edit` as its form has them now (the loaded one, or else
   * its snapshot); undefined without fields or once the target is gone.
   */
  private requestOf(edit: FieldEdits, fields: string[]): object | undefined {
    const source = this._form()?.id === edit.formId ? this._form() : edit.snapshot;
    return (source && fields.length > 0 && edit.build(source, fields)) || undefined;
  }

  /** Forgets `edit` once nothing of it is changed, waiting, queued or in flight. */
  private forgetIfSent(edit: FieldEdits): void {
    const done = edit.fields.size === 0 && edit.sending.size === 0;
    if (done && !edit.timer && edit.queued === 0 && this.edits.get(edit.key) === edit) {
      this.edits.delete(edit.key);
    }
  }

  /** Runs `send` of `fields` of `edit`, with them in `edit.sending` until it settles. */
  private async whileInFlight<T>(
    edit: FieldEdits,
    fields: string[],
    send: () => Promise<T>,
  ): Promise<T> {
    for (const field of fields) edit.sending.add(field);
    try {
      return await send();
    } finally {
      for (const field of fields) edit.sending.delete(field);
    }
  }

  /** Runs the edit `send`, counted in `sendingCount` (from now on) until it settles. */
  private async whileSending<T>(send: () => Promise<T>): Promise<T> {
    this.sendingCount.update((n) => n + 1);
    try {
      return await send();
    } finally {
      this.sendingCount.update((n) => n - 1);
      // Everything sent arrived or failed: a later send needs no warning until closing again.
      if (this.sendingCount() === 0) this.closeInterrupted.set(false);
    }
  }

  /** Marks `edit` as failed or not; see `unsaved`. */
  private setFailed(edit: FieldEdits, failed: boolean): void {
    if (edit.failed === failed) return;
    edit.failed = failed;
    this.updateUnsaved();
  }

  private updateUnsaved(): void {
    this.failedCount.set([...this.edits.values()].filter((edit) => edit.failed).length);
  }

  /**
   * Sends every waiting edit right away, past the creation queue and with `keepalive`,
   * so it still reaches the server while the page is being closed. The edits keep
   * waiting: if the page is only put in the back/forward cache and shown again, their
   * timers send them once more as usual (an edit sets fields, so it may arrive twice),
   * and a failure is reported then. Everything queued from now on waits for these sends,
   * so a late one doesn't overwrite a newer value.
   */
  private flushPatches(): void {
    const sends: Promise<unknown>[] = [];
    for (const edit of this.edits.values()) {
      if (!edit.timer) continue;
      const request = this.requestOf(edit, [...edit.fields]);
      if (request) sends.push(edit.send(request, true).catch(() => undefined));
    }
    if (sends.length > 0) this.creations = Promise.all([this.creations, ...sends]);
  }

  /**
   * Queues the removal `remove` (see `createOnServer`) without sending the edits `held`
   * picks ahead of it, since they would fail once their target is gone. Once it settled
   * they are sent after all, which drops them unsent if their target is gone (see
   * `deliver`), e.g. not if the removal failed or a failed move took it out. Meanwhile
   * they count as being sent (see `whileSending`), so leaving waits for them; sent
   * again from within, so they stay counted (`sendEdit` counts them at once).
   *
   * `held` picks by the tree as shown when asked, but what the removal takes along is
   * known only once it settled (e.g. a failed move put an element back into a removed
   * group), so failed edits whose target is gone then are dropped as well.
   */
  private async removeWithEdits(
    held: (edit: FieldEdits) => boolean,
    remove: (form: FormDefinition) => Promise<void>,
    apply: () => void,
  ): Promise<void> {
    const edits = [...this.edits.values()].filter(held);
    const removeIfThere = async (form: FormDefinition) => {
      try {
        await remove(form);
      } catch (error) {
        // Already gone, e.g. removed before while the answer got lost.
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
    };
    const settle = async () => {
      try {
        await this.createOnServer(removeIfThere, apply, (edit) => edits.includes(edit));
      } finally {
        for (const edit of edits) edit.failed = false;
        const form = this._form();
        for (const edit of [...this.edits.values()]) {
          const gone = form?.id === edit.formId && !edit.build(form, []);
          if (edit.failed && gone) this.edits.delete(edit.key);
        }
        this.updateUnsaved();
        for (const edit of edits) void this.sendEdit(edit.key);
      }
    };
    await (edits.length > 0 ? this.whileSending(settle) : settle());
  }

  /** Applies a change that is or will be sent to the server on its own. */
  private applyServerChange(change: (form: FormDefinition) => FormDefinition): void {
    this._form.update((f) => {
      if (!f) throw new Error('Form not set in store before update');
      return change(f);
    });
  }
}
