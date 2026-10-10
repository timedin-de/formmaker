import { computed, inject, Injectable, signal } from '@angular/core';
import { catchFn, has, walkConditionGroup, walkGroup } from '@shared/helper';
import type {
  ElementDefinition,
  Elements,
  ElementType,
  FormDefinition,
  FormSettings,
  PageDefinition,
  SaveFormDefinition,
} from '@shared/model/form.model';
import { type ElementId, elementId, uuid } from '@shared/model/ids';
import { parseFormData } from '@shared/schemas';
import { I18nService } from '../i18n/translation.service';
import { createElement, createPage, insertElementAfter } from './form-factory';
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
    return this.findElement(id);
  });

  readonly activePage = computed(() => {
    const pg = this.activePageId();
    return this.form().pages.find((p) => p.id === pg) ?? this.form().pages[0] ?? null;
  });

  private persistTimer: ReturnType<typeof setTimeout> | null = null;

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

  // ---- actions ---------------------------------------------------------------

  async createEmpty(): Promise<void> {
    const form = await this.repository.newForm();
    this._form.set(form);
    this.selectedId.set(null);
    this.dirty.set(true);
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

  addPage(): PageDefinition {
    const page = createPage(`Page ${this.form().pages.length + 1}`);
    this.patchForm({ pages: [...this.form().pages, page] });
    this.activePageId.set(page.id);
    return page;
  }

  clonePage(pageId: string): void {
    const src = this.form().pages.find((p) => p.id === pageId);
    if (!src) return;
    const copy = clonePageWithFreshId(src);
    const pages = this.form().pages;
    pages.push(copy);
    this.patchForm({ pages });
    this.selectedId.set(copy.id);
  }

  removePage(pageId: string): void {
    const pages = this.form().pages.filter((p) => p.id !== pageId);
    this.patchForm({ pages });
    if (this.activePageId() === pageId) this.activePageId.set(pages[0]?.id ?? null);
  }

  updatePage(pageId: string, patch: Partial<PageDefinition>): void {
    this.patchForm({
      pages: this.form().pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)),
    });
  }

  addElement(
    pageId: string,
    type: ElementType,
    label?: string,
    afterId: string | null = null,
  ): ElementDefinition {
    const page = this.form().pages.find((p) => p.id === pageId);
    if (!page) throw new Error(`Unknown page ${pageId}`);
    const el = createElement(type, label ?? this.i18n.t(`q.${type}`));
    const elements = insertElementAfter(page.elements, afterId, el);
    this.updatePage(pageId, { elements });
    this.selectedId.set(el.id);
    return el;
  }

  updateElement(elementId: string, patch: Partial<ElementDefinition>): void {
    const pages = this.form().pages;
    this.patchForm({
      pages: pages.map((p) => patchNested(p, elementId, patch)),
    });

    this.dirty.set(true);
    this.persist();
  }

  removeElement(elementId: string): void {
    const remove = (els: ElementDefinition[]): ElementDefinition[] =>
      els
        .filter((e) => e.id !== elementId)
        .map((e) => (e.type === 'group' ? { ...e, elements: remove(e.elements) } : e));
    this.patchForm({
      pages: this.form().pages.map((p) => ({ ...p, elements: remove(p.elements) })),
    });
    if (this.selectedId() === elementId) this.selectedId.set(null);
  }

  moveElement(elementId: string, direction: -1 | 1): void {
    const pages = this.form().pages.map((p) => ({
      ...p,
      elements: moveIn(p.elements, elementId, direction),
    }));
    this.patchForm({ pages });
  }

  /**
   * Move an element to an arbitrary position of an arbitrary container, wherever
   * it currently lives. `parentId === null` targets the root element list of the
   * page holding the element, otherwise the children of the group with that id.
   *
   * `index` follows CDK drop semantics: it is resolved against the destination
   * array *after* the element has been detached from its source, so the same
   * value works for both reorders and transfers.
   */
  moveElementTo(elementId: string, parentId: string | null, index: number): void {
    const source = this.findElement(elementId);
    if (!source) return;
    // A group may not be dropped into itself or one of its own descendants.
    if (parentId !== null && containsElement(source, parentId)) return;

    let moved = false;
    const pages = this.form().pages.map((page) => {
      const detached = detachFrom(page.elements, elementId);
      if (!detached.removed) return page;
      const attached = attachTo(detached.elements, parentId, detached.removed, index);
      // `attachTo` returns its input untouched when `parentId` is not on this page.
      if (attached === detached.elements) return page;
      moved = true;
      return { ...page, elements: attached };
    });
    if (!moved) return;
    this.patchForm({ pages });
  }

  duplicateElement(elementId: string): void {
    const src = this.findElement(elementId);
    if (!src) return;
    // Only ids inside the duplicated subtree are mapped, so references to other
    // fields keep pointing at the originals.
    const idMap: Record<ElementId, ElementId> = {};
    const copy = cloneElementWithFreshId(src, idMap);
    remapElementReferences([copy], idMap);
    const pages = this.form().pages.map((p) => {
      const walkGroups = (elements: ElementDefinition[]) => {
        const idx = elements.findIndex((e) => e.id === elementId);
        if (idx >= 0) {
          const next = [...elements];
          next.splice(idx + 1, 0, copy);
          return next;
        }
        return elements.map((e): ElementDefinition => {
          if (e.type === 'group') {
            return { ...e, elements: walkGroups(e.elements) };
          }
          return e;
        });
      };

      return { ...p, elements: walkGroups(p.elements) };
    });
    this.patchForm({ pages });
    this.selectedId.set(copy.id);
  }

  select(id: string | null): void {
    this.selectedId.set(id);
  }

  selectPage(id: string): void {
    if (this.form().pages.find((page) => page.id === id)) this.activePageId.set(id);
  }

  toJSON(): string {
    return JSON.stringify(this.form(), null, 2);
  }

  // ---- internals -------------------------------------------------------------

  private findElement(id: string): ElementDefinition | null {
    for (const page of this.form().pages) {
      const found = findIn(page.elements, id);
      if (found) return found;
    }
    return null;
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

function patchNested(
  page: PageDefinition,
  elementId: string,
  patch: Partial<ElementDefinition>,
): PageDefinition {
  const mapEl = (els: ElementDefinition[]): ElementDefinition[] =>
    els.map((e) => {
      if (e.id === elementId) return { ...e, ...patch } as ElementDefinition;
      if (e.type === 'group') return { ...e, elements: mapEl(e.elements) };
      return e;
    });
  return { ...page, elements: mapEl(page.elements) };
}

function findIn(els: ElementDefinition[], id: string): ElementDefinition | null {
  for (const e of els) {
    if (e.id === id) return e;
    if (e.type === 'group') {
      const found = findIn(e.elements, id);
      if (found) return found;
    }
  }
  return null;
}

/** True when `id` is `el` itself or lives anywhere inside its subtree. */
function containsElement(el: ElementDefinition, id: string): boolean {
  if (el.id === id) return true;
  return el.type === 'group' && el.elements.some((child) => containsElement(child, id));
}

/** Removes `id` from the tree. Returns the untouched input when `id` is absent. */
function detachFrom(
  els: Elements,
  id: string,
): { elements: Elements; removed: ElementDefinition | null } {
  const idx = els.findIndex((e) => e.id === id);
  if (idx >= 0) {
    const next = [...els];
    const [removed] = next.splice(idx, 1);
    return { elements: next, removed };
  }
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (el.type !== 'group') continue;
    const nested = detachFrom(el.elements, id);
    if (!nested.removed) continue;
    const next = [...els];
    next[i] = { ...el, elements: nested.elements };
    return { elements: next, removed: nested.removed };
  }
  return { elements: els, removed: null };
}

/** Inserts `el` at `index` of the group `parentId`, or of the root when `parentId` is null. */
function attachTo(
  els: Elements,
  parentId: string | null,
  el: ElementDefinition,
  index: number,
): Elements {
  if (parentId === null) {
    const next = [...els];
    next.splice(clamp(index, 0, els.length), 0, el);
    return next;
  }
  for (let i = 0; i < els.length; i++) {
    const candidate = els[i];
    if (candidate.type !== 'group') continue;
    if (candidate.id === parentId) {
      const next = [...els];
      next[i] = { ...candidate, elements: insertAt(candidate.elements, el, index) };
      return next;
    }
    const next = attachTo(candidate.elements, parentId, el, index);
    if (next !== candidate.elements) {
      const copy = [...els];
      copy[i] = { ...candidate, elements: next };
      return copy;
    }
  }
  return els;
}

function insertAt(els: Elements, el: ElementDefinition, index: number): Elements {
  const next = [...els];
  next.splice(clamp(index, 0, els.length), 0, el);
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function moveIn(els: ElementDefinition[], id: string, dir: -1 | 1): ElementDefinition[] {
  let out = els;
  const idx = out.findIndex((e) => e.id === id);
  if (idx < 0) {
    out = out.map((e) =>
      e.type === 'group' ? { ...e, elements: moveIn(e.elements, id, dir) } : e,
    );
    return out;
  }
  const target = idx + dir;
  if (target < 0 || target >= out.length) return out;
  const next = [...out];
  const oldItem = next[target];
  const [item] = next.splice(idx, 1);
  if (oldItem?.type === 'group') {
    const groupIdx = next.indexOf(oldItem);
    next[groupIdx] = {
      ...oldItem,
      elements: dir === 1 ? [item, ...oldItem.elements] : [...oldItem.elements, item],
    };
  } else {
    next.splice(target, 0, item);
  }
  return next;
}

/**
 * Deep-clone an element with fresh ids. When `idMap` is given, every element of
 * the cloned tree (group children included) records its old id → new id so that
 * references can be remapped afterwards.
 */
function cloneElementWithFreshId(
  el: ElementDefinition,
  idMap?: Record<ElementId, ElementId>,
): ElementDefinition {
  const cloned = structuredCloneSafe(el);
  cloned.label = `${el.label} (copy)`;

  const clone = (e: ElementDefinition) => {
    const id = elementId('q');
    if (idMap) idMap[e.id] = id;
    e.id = id;
    if ('options' in e) {
      e.options = e.options.map((o) => ({ ...o, id: uuid() }));
    }
    return e;
  };

  if (has(cloned, 'elements')) walkGroup(cloned.elements, clone);
  clone(cloned);

  return cloned;
}

/**
 * Point `defaultValue` / condition field references at their cloned counterparts.
 * Ids missing from `idMap` (i.e. fields outside the cloned tree) stay untouched.
 */
function remapElementReferences(
  elements: ElementDefinition[],
  idMap: Record<ElementId, ElementId>,
): void {
  function map<T extends object>(
    e: T,
    attribute: { [K in keyof T]: T[K] extends ElementId ? K : never }[keyof T],
  ) {
    if (idMap[e[attribute] as ElementId]) {
      (e[attribute] as string) = idMap[e[attribute] as ElementId];
    }
  }

  const patchDeps = (e: ElementDefinition) => {
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
    return e;
  };

  for (const e of elements) {
    if (has(e, 'elements')) walkGroup(e.elements, patchDeps);
    patchDeps(e);
  }
}

function clonePageWithFreshId(el: PageDefinition): PageDefinition {
  const cloned = structuredCloneSafe(el);
  cloned.id = uuid();
  cloned.title = `${el.title} (copy)`;
  cloned.subtitle = el.subtitle;

  if (!has(cloned, 'elements')) return cloned;

  // Collect old → new ids for the whole tree first, then remap references.
  const idMap: Record<ElementId, ElementId> = {};
  cloned.elements = cloned.elements.map((e) => cloneElementWithFreshId(e, idMap));
  remapElementReferences(cloned.elements, idMap);

  return cloned;
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
