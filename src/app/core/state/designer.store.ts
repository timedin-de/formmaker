import { computed, signal, Injectable, inject } from '@angular/core';
import type {
  ElementDefinition,
  FormDefinition,
  FormSettings,
  PageDefinition,
  QuestionType,
  ElementType,
} from '../../shared/model/form.model';
import { createElement, createPage, insertElementAfter, newForm } from './form-factory';
import { uuid } from '../../shared/model/ids';
import { I18nService } from '../i18n/translation.service';

const STORAGE_KEY = 'formmaker.designer.v1';

@Injectable()
export class DesignerStore {
  private readonly i18n = inject(I18nService);
  readonly form = signal<FormDefinition>(newForm());
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
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as FormDefinition;
        if (parsed && Array.isArray(parsed.pages)) {
          this.form.set(parsed);
          this.schedulePersist();
        }
      }
    } catch {
      /* corrupted storage — ignore */
    }
  }

  // ---- actions ---------------------------------------------------------------

  createEmpty(): void {
    this.form.set(newForm());
    this.selectedId.set(null);
    this.dirty.set(true);
    this.persist();
  }

  load(def: FormDefinition): void {
    const clean = normalizeForm(def);
    this.form.set(clean);
    this.selectedId.set(null);
    this.activePageId.set(clean.pages[0]?.id ?? null);
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
    type: QuestionType | ElementType,
    label?: string,
    afterId: string | null = null,
  ): ElementDefinition {
    const page = this.form().pages.find((p) => p.id === pageId);
    if (!page) throw new Error(`Unknown page ${pageId}`);
    const el = createElement(type, label ?? defaultLabel(type, this.i18n));
    const elements = insertElementAfter(page.elements, afterId, el);
    this.updatePage(pageId, { elements });
    this.selectedId.set(el.id);
    return el;
  }

  updateElement(elementId: string, patch: Partial<ElementDefinition>): void {
    this.form.update((f) => ({
      ...f,
      pages: f.pages.map((p) => patchNested(p, elementId, patch)),
    }));
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

  duplicateElement(elementId: string): void {
    const src = this.findElement(elementId);
    if (!src) return;
    const copy = cloneElementWithFreshId(src);
    const pages = this.form().pages.map((p) => {
      const container = findContainer(p, elementId);
      if (!container) return p;
      return { ...p, elements: insertInto(container, elementId, copy) };
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

  private patchForm(patch: Partial<FormDefinition>): void {
    this.form.update((f) => ({
      ...f,
      updatedAt: new Date().toISOString(),
      ...patch,
      createdAt: f.createdAt,
    }));
    this.dirty.set(true);
    this.persist();
  }

  private persist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.form()));
      } catch {
        /* storage full/unavailable */
      }
    }, 150);
  }

  private schedulePersist(): void {
    this.persist();
  }
}

function defaultLabel(type: ElementType, i18n: I18nService): string {
  const key: Record<ElementType, string> = {
    text: 'q.shortText',
    longText: 'q.longText',
    number: 'q.number',
    date: 'q.date',
    time: 'q.time',
    dateTime: 'q.dateTime',
    boolean: 'q.yesNo',
    choice: 'q.single',
    dropdown: 'q.dropdown',
    multiChoice: 'q.multiple',
    scale: 'q.scale',
    file: 'q.file',
    signature: 'q.signature',
    group: 'q.group',
    section: 'q.section',
    textdisplay: 'q.textdisplay',
  };
  return i18n.t(key[type] ?? 'q.shortText');
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
  const [item] = next.splice(idx, 1);
  next.splice(target, 0, item);
  return next;
}

function normalizeForm(def: unknown): FormDefinition {
  const form = def as FormDefinition;
  if (!form.pages) form.pages = [];
  form.schemaVersion = 1;
  form.settings = { ...form.settings };
  return form;
}

/** Locate the elements array holding `id` (top-level page array or a group's). */
function findContainer(page: PageDefinition, id: string): ElementDefinition[] | null {
  const hunt = (els: ElementDefinition[]): ElementDefinition[] | null => {
    if (els.some((e) => e.id === id)) return els;
    for (const e of els) {
      if (e.type === 'group') {
        const found = hunt(e.elements);
        if (found) return found;
      }
    }
    return null;
  };
  return hunt(page.elements);
}

function insertInto<T extends ElementDefinition>(container: T[], afterId: string, el: T): T[] {
  const idx = container.findIndex((e) => e.id === afterId);
  const next = [...container];
  next.splice(idx + 1, 0, el);
  return next;
}

function cloneElementWithFreshId(el: ElementDefinition): ElementDefinition {
  const cloned = structuredCloneSafe(el);
  cloned.id = uuid();
  cloned.label = `${el.label} (copy)`;
  if ('options' in cloned) {
    cloned.options = cloned.options.map((o) => ({ ...o, id: uuid() }));
  }
  if (cloned.type === 'group') {
    cloned.elements = cloned.elements.map((c) => ({ ...c, id: uuid() }));
  }
  return cloned;
}

function clonePageWithFreshId(el: PageDefinition): PageDefinition {
  const cloned = structuredCloneSafe(el);
  cloned.id = uuid();
  cloned.title = `${el.title} (copy)`;
  cloned.subtitle = `${el.subtitle ?? ''}`;

  if ('elements' in cloned) {
    cloned.elements = cloned.elements.map((e) => cloneElementWithFreshId(e));
  }
  return cloned;
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
