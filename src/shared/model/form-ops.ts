import type { Condition, ConditionGroup } from './conditions.model';
import {
  descendants,
  type FormDocument,
  getElement,
  getParent,
  parentOf,
  subtreeIds,
} from './form-tree';
import type { ElementDefinition, FormElements, PageDefinition } from './form.model';
import { type ElementId, elementId, type PageId, uuid } from './ids';

/*
 * Immutable edits of a form document, shared by the designer and the server.
 * Each returns a new document and leaves its input untouched. Operations that
 * cannot apply return null (invalid target) or the input itself (nothing to do).
 */

/** Replaces the children of the page or group `parentId`; null when there is no such parent. */
function updateChildren<T extends FormDocument>(
  form: T,
  parentId: string,
  update: (children: ElementId[]) => ElementId[],
): T | null {
  const parent = getParent(form, parentId);
  if (!parent) return null;
  const children = update(parent.children);
  if ('type' in parent) {
    return { ...form, elements: { ...form.elements, [parent.id]: { ...parent, children } } };
  }
  return { ...form, pages: form.pages.map((p) => (p === parent ? { ...p, children } : p)) };
}

function withoutElements(elements: FormElements, ids: ElementId[]): FormElements {
  const drop = new Set(ids);
  return Object.fromEntries(Object.entries(elements).filter(([id]) => !drop.has(id)));
}

function byId(elements: ElementDefinition[]): FormElements {
  return Object.fromEntries(elements.map((el) => [el.id, el]));
}

/**
 * Inserts `el` into the page or group `parentId` at `index` (clamped). `subtree`
 * holds the elements below `el` when it is a group that already has children.
 * Returns null when the parent does not exist.
 */
export function insertElementAt<T extends FormDocument>(
  form: T,
  parentId: string,
  index: number,
  el: ElementDefinition,
  subtree: ElementDefinition[] = [],
): T | null {
  const next = updateChildren(form, parentId, (children) => {
    const copy = [...children];
    copy.splice(Math.min(Math.max(index, 0), children.length), 0, el.id);
    return copy;
  });
  if (!next) return null;
  return { ...next, elements: { ...next.elements, ...byId(subtree), [el.id]: el } };
}

/**
 * Inserts `el` into the page or group `parentId` right after the child `afterId`,
 * or at the end when `afterId` is null. Returns null when the parent does not exist
 * or `afterId` is not a direct child of it.
 */
export function insertElement<T extends FormDocument>(
  form: T,
  parentId: string,
  afterId: ElementId | null,
  el: ElementDefinition,
  subtree: ElementDefinition[] = [],
): T | null {
  const parent = getParent(form, parentId);
  if (!parent) return null;
  const index = afterId === null ? parent.children.length : parent.children.indexOf(afterId) + 1;
  if (index === 0 && afterId !== null) return null;
  return insertElementAt(form, parentId, index, el, subtree);
}

/** Merges `patch` into the element `id`; returns the input when there is no such element. */
export function updateElement<T extends FormDocument>(
  form: T,
  id: ElementId,
  patch: Partial<ElementDefinition>,
): T {
  const el = getElement(form, id);
  if (!el) return form;
  return {
    ...form,
    elements: { ...form.elements, [id]: { ...el, ...patch } as ElementDefinition },
  };
}

/** Removes the element `id` together with everything below it. */
export function removeElement<T extends FormDocument>(form: T, id: ElementId): T {
  const parent = parentOf(form, id);
  if (!parent) return form;
  const detached = updateChildren(form, parent.id, (children) => children.filter((c) => c !== id));
  if (!detached) return form;
  return { ...detached, elements: withoutElements(detached.elements, subtreeIds(form, id)) };
}

/**
 * Moves the element `id` to `index` of the page or group `parentId`. `index` is
 * resolved after the element has been detached from its current parent, so the
 * same value works for reorders and transfers. Returns null when the target does
 * not exist or lies inside the moved element.
 */
export function moveElementTo<T extends FormDocument>(
  form: T,
  id: ElementId,
  parentId: string,
  index: number,
): T | null {
  const el = getElement(form, id);
  const source = parentOf(form, id);
  if (!el || !source || !getParent(form, parentId)) return null;
  if (subtreeIds(form, id).includes(parentId)) return null;

  const detached = updateChildren(form, source.id, (children) => children.filter((c) => c !== id));
  return detached && insertElementAt(detached, parentId, index, el);
}

/**
 * Moves the element `id` one step up (-1) or down (1) among its siblings. A
 * neighbouring group takes the element in instead: at its end when moving up,
 * at its start when moving down.
 */
export function moveElement<T extends FormDocument>(form: T, id: ElementId, dir: -1 | 1): T {
  const parent = parentOf(form, id);
  if (!parent) return form;
  const index = parent.children.indexOf(id);
  const target = index + dir;
  if (target < 0 || target >= parent.children.length) return form;

  const neighbour = getElement(form, parent.children[target]);
  if (neighbour?.type === 'group') {
    const at = dir === 1 ? 0 : neighbour.children.length;
    return moveElementTo(form, id, neighbour.id, at) ?? form;
  }
  return (
    updateChildren(form, parent.id, (children) => {
      const copy = [...children];
      copy.splice(index, 1);
      copy.splice(target, 0, id);
      return copy;
    }) ?? form
  );
}

/** Appends `page`; `elements` holds every element the page reaches. */
export function addPage<T extends FormDocument>(
  form: T,
  page: PageDefinition,
  elements: ElementDefinition[] = [],
): T {
  return {
    ...form,
    pages: [...form.pages, page],
    elements: { ...form.elements, ...byId(elements) },
  };
}

/** Removes the page `pageId` together with all of its elements. */
export function removePage<T extends FormDocument>(form: T, pageId: PageId): T {
  const page = form.pages.find((p) => p.id === pageId);
  if (!page) return form;
  const ids = page.children.flatMap((id) => subtreeIds(form, id));
  return {
    ...form,
    pages: form.pages.filter((p) => p !== page),
    elements: withoutElements(form.elements, ids),
  };
}

/** A fresh-id copy of an element and everything below it. */
export interface ElementClone {
  /** The copied element itself. */
  element: ElementDefinition;
  /** Every element below the copy, in document order. */
  subtree: ElementDefinition[];
}

/** A fresh-id copy of a page and every element it reaches. */
export interface PageClone {
  page: PageDefinition;
  /** Every element the copied page reaches, in document order. */
  elements: ElementDefinition[];
}

/**
 * Deep-clones the element `id` and everything below it with fresh ids.
 * References between the copied elements (defaults, conditions) are remapped
 * to the copies; references to elements outside the clone stay untouched.
 * The root's label gets the localized `suffix`. Returns null when there is no
 * such element.
 */
export function cloneElement(
  form: FormDocument,
  id: ElementId,
  suffix: string,
): ElementClone | null {
  const { rootIds, elements } = cloneSubtrees(form, [id]);
  const element = elements.find((el) => el.id === rootIds[0]);
  if (!element) return null;
  element.label = `${element.label} ${suffix}`;
  return { element, subtree: elements.filter((el) => el.id !== element.id) };
}

/**
 * Deep-clones the page `pageId` and every element it reaches with fresh ids.
 * References between the copied elements are remapped to the copies, including
 * page conditions that point at an element of the copied page; references to
 * elements on other pages stay untouched. The page title and the labels of its
 * root elements get the localized `suffix`. Returns null when there is no such
 * page.
 */
export function clonePage(form: FormDocument, pageId: PageId, suffix: string): PageClone | null {
  const source = form.pages.find((page) => page.id === pageId);
  if (!source) return null;

  const { rootIds, elements, idMap } = cloneSubtrees(form, source.children);
  const roots = new Set(rootIds);
  for (const element of elements) {
    if (roots.has(element.id)) element.label = `${element.label} ${suffix}`;
  }

  const page = structuredClone(source);
  page.id = elementId('page');
  page.title = `${source.title} ${suffix}`;
  page.children = rootIds;
  if (page.enabledWhen) remapConditionGroup(page.enabledWhen, idMap);
  return { page, elements };
}

/**
 * Deep-clones the elements `ids` and everything below them with fresh ids.
 * References between the cloned elements (defaults, conditions) are remapped
 * to the copies; references to elements outside the clone stay untouched.
 * Returns the ids of the copied roots, in order, all copied elements, and the
 * old → new id map.
 */
function cloneSubtrees(
  form: FormDocument,
  ids: ElementId[],
): {
  rootIds: ElementId[];
  elements: ElementDefinition[];
  idMap: Record<ElementId, ElementId>;
} {
  const originals = ids.flatMap((id) => {
    const el = getElement(form, id);
    if (!el) return [];
    return el.type === 'group' ? [el, ...descendants(form, el)] : [el];
  });

  const idMap: Record<ElementId, ElementId> = {};
  for (const el of originals) idMap[el.id] = elementId('q');

  const elements = originals.map((el) => {
    const copy = structuredClone(el);
    copy.id = idMap[el.id];
    if ('options' in copy) copy.options = copy.options.map((o) => ({ ...o, id: uuid() }));
    if (copy.type === 'group') copy.children = copy.children.map((id) => idMap[id] ?? id);
    remapElementReferences(copy, idMap);
    return copy;
  });
  return { rootIds: ids.filter((id) => idMap[id]).map((id) => idMap[id]), elements, idMap };
}

/**
 * Point `defaultValue` / condition field references at their cloned counterparts.
 * Ids missing from `idMap` (i.e. fields outside the cloned tree) stay untouched.
 */
function remapElementReferences(e: ElementDefinition, idMap: Record<ElementId, ElementId>): void {
  if ('defaultValue' in e && e.defaultValue?.kind === 'fromField') {
    if (idMap[e.defaultValue.fieldId]) {
      e.defaultValue.fieldId = idMap[e.defaultValue.fieldId];
    }
  }

  if (e.enabledWhen) remapConditionGroup(e.enabledWhen, idMap);
}

function remapConditionGroup(group: ConditionGroup, idMap: Record<ElementId, ElementId>): void {
  walkConditions(group, (condition) => {
    mapReference(condition, 'fieldId', idMap);
    if (condition.operand?.kind === 'field') {
      mapReference(condition.operand, 'fieldId', idMap);
    }
    if (condition.operandTo?.kind === 'field') {
      mapReference(condition.operandTo, 'fieldId', idMap);
    }
  });
}

function walkConditions(group: ConditionGroup, visit: (condition: Condition) => void): void {
  for (const condition of group.conditions) visit(condition);
  for (const nested of group.groups) walkConditions(nested, visit);
}

function mapReference<T extends object>(
  target: T,
  attribute: { [K in keyof T]: T[K] extends ElementId ? K : never }[keyof T],
  idMap: Record<ElementId, ElementId>,
): void {
  const id = target[attribute] as ElementId;
  if (idMap[id]) (target[attribute] as string) = idMap[id];
}
