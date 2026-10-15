import { isQuestion } from '@shared/helper';
import type {
  ElementDefinition,
  GroupElement,
  PageDefinition,
  SaveFormDefinition,
} from './form.model';
import type { ElementId } from './ids';

/** The parts of a form that make up its element tree. */
export type FormDocument = Pick<SaveFormDefinition, 'pages'>;

/** A container of elements: a page or a group. */
export type ElementParent = PageDefinition | GroupElement;

/** The direct children of a page or group, in order. */
export function childrenOf(_form: FormDocument, parent: ElementParent): ElementDefinition[] {
  return parent.elements;
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

export function findElement(form: FormDocument, id: ElementId): ElementDefinition | undefined {
  return descendants(form).find((el) => el.id === id);
}

/** Number of elements that are neither groups nor sections. */
export function countQuestions(form: FormDocument): number {
  return descendants(form).filter((el) => isQuestion(el)).length;
}
