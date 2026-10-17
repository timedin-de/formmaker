import { isQuestion } from '@shared/helper';
import type {
  ElementDefinition,
  GroupElement,
  PageDefinition,
  SaveFormDefinition,
} from './form.model';
import type { ElementId } from './ids';

/** The parts of a form that make up its element tree. */
export type FormDocument = Pick<SaveFormDefinition, 'pages' | 'elements'>;

/** A container of elements: a page or a group. */
export type ElementParent = PageDefinition | GroupElement;

/** The element with the given id, or undefined. */
export function getElement(form: FormDocument, id: ElementId): ElementDefinition | undefined {
  return Object.hasOwn(form.elements, id) ? form.elements[id] : undefined;
}

/** The page or group with the given id, or undefined. */
export function getParent(form: FormDocument, id: string): ElementParent | undefined {
  const page = form.pages.find((p) => p.id === id);
  if (page) return page;
  const el = getElement(form, id);
  return el?.type === 'group' ? el : undefined;
}

/** The page or group that lists `id` as a child, or undefined. */
export function parentOf(form: FormDocument, id: ElementId): ElementParent | undefined {
  return (
    form.pages.find((p) => p.children.includes(id)) ??
    Object.values(form.elements).find(
      (el): el is GroupElement => el.type === 'group' && el.children.includes(id),
    )
  );
}

/** The direct children of a page or group, in order. */
export function childrenOf(form: FormDocument, parent: ElementParent): ElementDefinition[] {
  return parent.children.flatMap((id) => getElement(form, id) ?? []);
}

/**
 * Visits the elements below `parent`, or below every page when it is omitted,
 * depth-first in document order. `depth` is 0 for the direct children.
 */
export function walkElements(
  form: FormDocument,
  visit: (el: ElementDefinition, depth: number) => void,
  parent?: ElementParent,
): void {
  const walk = (container: ElementParent, depth: number): void => {
    for (const el of childrenOf(form, container)) {
      visit(el, depth);
      if (el.type === 'group') walk(el, depth + 1);
    }
  };
  if (parent) walk(parent, 0);
  else for (const page of form.pages) walk(page, 0);
}

/** All elements below `parent` (or of the whole form), in document order. */
export function descendants(form: FormDocument, parent?: ElementParent): ElementDefinition[] {
  const out: ElementDefinition[] = [];
  walkElements(form, (el) => out.push(el), parent);
  return out;
}

/** Ids of `id` and of every element below it. */
export function subtreeIds(form: FormDocument, id: ElementId): ElementId[] {
  const el = getElement(form, id);
  if (!el) return [];
  return el.type === 'group' ? [id, ...descendants(form, el).map((e) => e.id)] : [id];
}

/** Number of elements that are neither groups nor sections. */
export function countQuestions(form: FormDocument): number {
  return descendants(form).filter((el) => isQuestion(el)).length;
}
