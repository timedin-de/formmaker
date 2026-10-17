import { computed, inject, Injectable, signal } from '@angular/core';
import { catchFn, has, walkConditionGroup } from '@shared/helper';
import {
  addPage,
  insertElement,
  moveElement,
  moveElementTo,
  removeElement,
  removePage,
  updateElement,
} from '@shared/model/form-ops';
import {
  childrenOf,
  descendants,
  type ElementParent,
  type FormDocument,
  getElement,
  parentOf,
} from '@shared/model/form-tree';
import type {
  ElementDefinition,
  ElementType,
  FormDefinition,
  FormSettings,
  PageDefinition,
  SaveFormDefinition,
} from '@shared/model/form.model';
import { type ElementId, elementId, uuid } from '@shared/model/ids';
import { parseFormData } from '@shared/schemas';
import { I18nService } from '../i18n/translation.service';
import { FormsRepository } from './forms.repository';

const STORAGE_KEY = 'formmaker.designer.v1';

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

  constructor() {
    void this.hydrate();
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
    const form = await this.repository.newForm();
    this._form.set(form);
    this.selectedId.set(null);
    this.dirty.set(false);
    this.persist();
  }

  load(def: FormDefinition): void {
    this._form.set(def);
    this.selectedId.set(null);
    this.activePageId.set(def.pages[0]?.id ?? null);
    this.dirty.set(false);
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
      this.repository.addPage(form.id, `Page ${form.pages.length + 1}`),
    );
    this.applyServerChange((f) => addPage(f, page));
    this.activePageId.set(page.id);
    return page;
  }

  clonePage(pageId: string): void {
    const form = this.form();
    const src = form.pages.find((p) => p.id === pageId);
    if (!src) return;
    // Every element of the page is cloned at once, so references between them
    // point at the copies while references to other pages stay as they are.
    const { rootIds, elements } = cloneSubtrees(form, src.children);
    for (const el of elements) {
      if (rootIds.includes(el.id)) el.label = `${el.label} (copy)`;
    }
    const copy: PageDefinition = {
      ...structuredCloneSafe(src),
      id: uuid(),
      title: `${src.title} (copy)`,
      children: rootIds,
    };
    this.patchDocument(addPage(form, copy, elements));
    this.selectedId.set(copy.id);
  }

  async removePage(pageId: string) {
    await this.repository.deletePage(this.form().id, pageId);
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
      }),
    );
    // The tree may have changed during the request: if `afterId` is gone, append instead.
    // If the parent itself is gone, its removal was sent to the server too, so skip it.
    let inserted = false;
    this.applyServerChange((f) => {
      const pages =
        insertIntoParent(f.pages, parentId, afterId, el) ??
        insertIntoParent(f.pages, parentId, null, el);
      inserted = pages !== null;
      return pages ? { ...f, pages } : f;
    });
    if (inserted) this.selectedId.set(el.id);
    return el;
  }

  updateElement(elementId: string, patch: Partial<ElementDefinition>): void {
    this.updateElements([[elementId, patch]]);
  }

  /** Applies several element patches as one change. */
  updateElements(patches: [ElementId, Partial<ElementDefinition>][]): void {
    let next: FormDocument = this.form();
    for (const [id, patch] of patches) next = updateElement(next, id, patch);
    this.patchDocument(next);
  }

  async removeElement(elementId: string) {
    await this.repository.deleteElement(this.form().id, elementId);
    this.applyServerChange((f) => removeElement(f, elementId));
    if (this.selectedId() === elementId) this.selectedId.set(null);
  }

  moveElement(elementId: string, direction: -1 | 1): void {
    this.patchDocument(moveElement(this.form(), elementId, direction));
  }

  /**
   * Move an element to an arbitrary position of an arbitrary container (a page or
   * a group), wherever it currently lives.
   *
   * `index` follows CDK drop semantics: it is resolved against the destination
   * array *after* the element has been detached from its source, so the same
   * value works for both reorders and transfers.
   */
  moveElementTo(elementId: string, parentId: string, index: number): void {
    const next = moveElementTo(this.form(), elementId, parentId, index);
    if (next) this.patchDocument(next);
  }

  duplicateElement(elementId: string): void {
    const form = this.form();
    const parent = parentOf(form, elementId);
    if (!parent) return;
    // Only ids inside the duplicated subtree are mapped, so references to other
    // fields keep pointing at the originals.
    const {
      rootIds: [copyId],
      elements,
    } = cloneSubtrees(form, [elementId]);
    const copy = elements.find((el) => el.id === copyId);
    if (!copy) return;
    copy.label = `${copy.label} (copy)`;
    const subtree = elements.filter((el) => el !== copy);
    const next = insertElement(form, parent.id, elementId, copy, subtree);
    if (!next) return;
    this.patchDocument(next);
    this.selectedId.set(copy.id);
  }

  select(id: string | null): void {
    this.selectedId.set(id);
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
   * Queues a server-side creation for the form that is loaded now. Rejects instead of
   * sending or applying it once another form has been loaded in the meantime.
   */
  private createOnServer<T>(create: (form: FormDefinition) => Promise<T>): Promise<T> {
    const formId = this.form().id;
    const assertSameForm = () => {
      if (this._form()?.id !== formId) throw new Error('designer: form changed during creation');
    };
    const run = this.creations.then(async () => {
      assertSameForm();
      if (this.dirty()) {
        const snapshot = this.form();
        await this.repository.saveForm(snapshot);
        // Edits made while the save was in flight are still unsaved.
        if (this.form() === snapshot) this.dirty.set(false);
        assertSameForm();
      }
      const result = await create(this.form());
      assertSameForm();
      return result;
    });
    this.creations = run.catch(() => undefined);
    return run;
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

/**
 * Deep-clones the elements `ids` and everything below them with fresh ids.
 * References between the cloned elements (defaults, conditions) are remapped
 * to the copies; references to elements outside the clone stay untouched.
 * Returns the ids of the copied roots, in order, and all copied elements.
 */
function cloneSubtrees(
  form: FormDocument,
  ids: ElementId[],
): { rootIds: ElementId[]; elements: ElementDefinition[] } {
  const originals = ids.flatMap((id) => {
    const el = getElement(form, id);
    if (!el) return [];
    return el.type === 'group' ? [el, ...descendants(form, el)] : [el];
  });

  const idMap: Record<ElementId, ElementId> = {};
  for (const el of originals) idMap[el.id] = elementId('q');

  const elements = originals.map((el) => {
    const copy = structuredCloneSafe(el);
    copy.id = idMap[el.id];
    if ('options' in copy) copy.options = copy.options.map((o) => ({ ...o, id: uuid() }));
    if (copy.type === 'group') copy.children = copy.children.map((id) => idMap[id] ?? id);
    remapElementReferences(copy, idMap);
    return copy;
  });
  return { rootIds: ids.filter((id) => idMap[id]).map((id) => idMap[id]), elements };
}

/**
 * Point `defaultValue` / condition field references at their cloned counterparts.
 * Ids missing from `idMap` (i.e. fields outside the cloned tree) stay untouched.
 */
function remapElementReferences(e: ElementDefinition, idMap: Record<ElementId, ElementId>): void {
  function map<T extends object>(
    target: T,
    attribute: { [K in keyof T]: T[K] extends ElementId ? K : never }[keyof T],
  ) {
    if (idMap[target[attribute] as ElementId]) {
      (target[attribute] as string) = idMap[target[attribute] as ElementId];
    }
  }

  if (has(e, 'defaultValue') && e.defaultValue?.kind === 'fromField') {
    if (idMap[e.defaultValue.fieldId]) {
      e.defaultValue.fieldId = idMap[e.defaultValue.fieldId];
    }
  }

  if (e.enabledWhen) {
    walkConditionGroup(e.enabledWhen, (condition) => {
      map(condition, 'fieldId');
      if (condition.operand?.kind === 'field') {
        map(condition.operand, 'fieldId');
      }
      if (condition.operandTo?.kind === 'field') {
        map(condition.operandTo, 'fieldId');
      }
    });
  }
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
