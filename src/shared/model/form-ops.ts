import { dict } from '@shared/helper';
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

type KeysOf<T> = T extends unknown ? keyof T : never;
type FieldOf<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never;

/** Element fields that have endpoints of their own or never change, so a patch can't touch them. */
export type FixedElementField = 'id' | 'type' | 'children' | 'options' | 'validations';

/** A field that may be absent can be set to null, which removes it. */
type PatchValue<V> = undefined extends V ? Exclude<V, undefined> | null : V;

/**
 * A change to the fields of an element, as sent to the element PATCH endpoint.
 * A field set to null is removed (JSON has no undefined).
 */
export type ElementPatch = {
  [K in Exclude<KeysOf<ElementDefinition>, FixedElementField>]?: PatchValue<
    FieldOf<ElementDefinition, K>
  >;
};

/**
 * Sets the default of every child of the group `targetId` to the child of the group
 * `sourceId` at the same position, recursively; a group copies from another group.
 */
function pairGroupDefaults<T extends FormDocument>(form: T, targetId: string, sourceId: string): T {
  const target = getElement(form, targetId);
  const source = getElement(form, sourceId);
  if (target?.type !== 'group' || source?.type !== 'group') return form;
  let next = form;
  target.children.forEach((childId, i) => {
    const srcId = source.children[i];
    const child = getElement(next, childId);
    if (!srcId || !child) return;
    if ('defaultValue' in child) {
      next = updateElement(next, childId, { defaultValue: { kind: 'fromField', fieldId: srcId } });
    }
    next = pairGroupDefaults(next, childId, srcId);
  });
  return next;
}

/**
 * Applies `patch` to the element `id`: null removes a field, other values replace it.
 * A group that takes its default from another group pairs up its children as well
 * (see `pairGroupDefaults`). Returns the input when there is no such element. The
 * result is not validated, so the server parses the patched element afterwards.
 */
export function patchElement<T extends FormDocument>(
  form: T,
  id: ElementId,
  patch: ElementPatch,
): T {
  const el = getElement(form, id);
  if (!el) return form;
  const patched: Record<string, unknown> = { ...el };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null && key !== 'defaultValue') delete patched[key];
    else if (value !== undefined) patched[key] = value;
  }
  // Unchecked: the patch may hold fields this type lacks (see above).
  const element = patched as unknown as ElementDefinition;
  const next = { ...form, elements: { ...form.elements, [id]: element } };
  const def = patch.defaultValue;
  return def?.kind === 'fromField' ? pairGroupDefaults(next, id, def.fieldId) : next;
}

/** A change to the fields of a page, as sent to the page PATCH endpoint; null removes. */
export interface PagePatch {
  title?: string;
  subtitle?: string;
  enabledWhen?: ConditionGroup | null;
}

/**
 * Applies `patch` to the page `pageId`: null removes a field, other values replace it.
 * Returns the input when there is no such page.
 */
export function patchPage<T extends FormDocument>(form: T, pageId: PageId, patch: PagePatch): T {
  const page = form.pages.find((p) => p.id === pageId);
  if (!page) return form;
  const patched: PageDefinition = { ...page };
  if (patch.title !== undefined) patched.title = patch.title;
  if (patch.subtitle !== undefined) patched.subtitle = patch.subtitle;
  if (patch.enabledWhen === null) delete patched.enabledWhen;
  else if (patch.enabledWhen !== undefined) patched.enabledWhen = patch.enabledWhen;
  return { ...form, pages: form.pages.map((p) => (p === page ? patched : p)) };
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
 * Moves the option `optionId` of the choice element `elementId` to `index` (clamped)
 * of its options, counted after taking it out. Returns null when there is no such
 * choice element or option.
 */
export function moveOptionTo<T extends FormDocument>(
  form: T,
  elementId: ElementId,
  optionId: string,
  index: number,
): T | null {
  const el = getElement(form, elementId);
  if (!el || !('options' in el)) return null;
  const option = el.options.find((o) => o.id === optionId);
  if (!option) return null;
  const options = el.options.filter((o) => o !== option);
  options.splice(Math.min(Math.max(index, 0), options.length), 0, option);
  return updateElement(form, elementId, { options });
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
 * elements on other pages stay untouched. Only the page title gets the localized
 * `suffix`; the copied elements keep their labels. Returns null when there is no
 * such page.
 */
export function clonePage(form: FormDocument, pageId: PageId, suffix: string): PageClone | null {
  const source = form.pages.find((page) => page.id === pageId);
  if (!source) return null;

  const { rootIds, elements, idMap, optionMaps } = cloneSubtrees(form, source.children);
  const page = structuredClone(source);
  page.id = elementId('page');
  page.title = `${source.title} ${suffix}`;
  page.children = rootIds;
  if (page.enabledWhen) remapConditionGroup(page.enabledWhen, idMap, optionMaps);
  return { page, elements };
}

/**
 * Deep-clones the elements `ids` and everything below them with fresh ids.
 * References between the cloned elements (defaults, conditions) are remapped
 * to the copies; references to elements outside the clone stay untouched.
 * Choice options get fresh ids too, and static defaults and condition values
 * that select a copied option are remapped to the copied option.
 * Returns the ids of the copied roots, in order, all copied elements, the
 * old → new id map, and per original choice id its old → new option id map.
 */
function cloneSubtrees(
  form: FormDocument,
  ids: ElementId[],
): {
  rootIds: ElementId[];
  elements: ElementDefinition[];
  idMap: Record<ElementId, ElementId>;
  optionMaps: OptionMaps;
} {
  const originals = ids.flatMap((id) => {
    const el = getElement(form, id);
    if (!el) return [];
    return el.type === 'group' ? [el, ...descendants(form, el)] : [el];
  });

  const idMap: Record<ElementId, ElementId> = dict();
  const optionMaps = dict<OptionMaps[ElementId]>();
  for (const el of originals) {
    idMap[el.id] = elementId('q');
    if ('options' in el) {
      const options = dict<string>();
      for (const o of el.options) options[o.id] = uuid();
      optionMaps[el.id] = options;
    }
  }

  const elements = originals.map((el) => {
    const copy = structuredClone(el);
    copy.id = idMap[el.id];
    if ('options' in copy) {
      const options = optionMaps[el.id];
      copy.options = copy.options.map((o) => ({ ...o, id: options[o.id] }));
      if (copy.defaultValue?.kind === 'static') {
        copy.defaultValue.value = mapOptionValue(copy.defaultValue.value, options);
      }
    }
    if (copy.type === 'group') copy.children = copy.children.map((id) => idMap[id] ?? id);
    remapElementReferences(copy, idMap, optionMaps);
    return copy;
  });
  return {
    rootIds: ids.filter((id) => idMap[id]).map((id) => idMap[id]),
    elements,
    idMap,
    optionMaps,
  };
}

/** Per original choice id, the old → new id map of its options. */
type OptionMaps = Record<ElementId, Record<string, string>>;

/** Replaces option ids found in `options` (a single id or a list of ids); other values stay. */
function mapOptionValue<V>(value: V, options: Record<string, string> | undefined): V {
  if (!options) return value;
  if (typeof value === 'string') return (options[value] ?? value) as V;
  if (Array.isArray(value)) {
    return value.map((v: unknown) => (typeof v === 'string' ? (options[v] ?? v) : v)) as V;
  }
  return value;
}

/**
 * Point `defaultValue` / condition field references at their cloned counterparts.
 * Ids missing from `idMap` (i.e. fields outside the cloned tree) stay untouched.
 */
function remapElementReferences(
  e: ElementDefinition,
  idMap: Record<ElementId, ElementId>,
  optionMaps: OptionMaps,
): void {
  if ('defaultValue' in e && e.defaultValue?.kind === 'fromField') {
    if (idMap[e.defaultValue.fieldId]) {
      e.defaultValue.fieldId = idMap[e.defaultValue.fieldId];
    }
  }

  if (e.enabledWhen) remapConditionGroup(e.enabledWhen, idMap, optionMaps);
}

function remapConditionGroup(
  group: ConditionGroup,
  idMap: Record<ElementId, ElementId>,
  optionMaps: OptionMaps,
): void {
  walkConditions(group, (condition) => {
    // Option values belong to the tested field, so look them up before its id is remapped.
    const options = condition.fieldId ? optionMaps[condition.fieldId] : undefined;
    if (condition.operand?.kind === 'literal') {
      condition.operand.value = mapOptionValue(condition.operand.value, options);
    }
    if (condition.operandTo?.kind === 'literal') {
      condition.operandTo.value = mapOptionValue(condition.operandTo.value, options);
    }
    if (condition.values) condition.values = mapOptionValue(condition.values, options);
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
