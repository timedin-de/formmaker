import type { ElementDefinition, FormElements, PageDefinition } from './form.model';
import { type FormDocument, getElement, getParent, parentOf, subtreeIds } from './form-tree';
import type { ElementId, PageId } from './ids';

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
