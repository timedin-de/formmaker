import type {
  ElementDefinition,
  GroupElement,
  PageDefinition,
  FormDefinition,
} from '../../shared/model/form.model';
import { templateReferences } from './expression/template';
import { expressionReferences } from './expression/evaluator';
import { conditionGroupReferences } from './condition-engine';
import { EMPTY_CONDITION_GROUP } from '../../shared/model/conditions.model';
import type { ConditionGroup } from '../../shared/model/conditions.model';
import { hasSet } from '../../shared/helper';

/** Collect all field ids that `el` depends on (expressions, pipes, defaults, validations, etc.). */
export function collectElementRefs(el: ElementDefinition): string[] {
  const refs = new Set<string>();

  const addGroup = (g: ConditionGroup | undefined | null) => {
    if (!g || g === EMPTY_CONDITION_GROUP) return;
    conditionGroupReferences(g).forEach((r) => refs.add(r));
  };
  const addRefs = (src: string | undefined) => {
    if (src) templateReferences(src).forEach((r) => refs.add(r));
  };
  const addExpr = (src: string | undefined) => {
    if (src) expressionReferences(src).forEach((r) => refs.add(r));
  };

  // Piped strings
  addRefs(el.label);
  addRefs(el.description);
  if (hasSet(el, 'placeholder')) addRefs(el.placeholder);

  // Enabled-when condition (element/group visibility)
  addGroup(el.enabledWhen);

  // Validations (message pipes, custom expression)
  if (hasSet(el, 'validations')) {
    for (const v of el.validations) {
      addRefs(v.message);
      addExpr(v.expression);
    }
  }

  // Default value
  if (hasSet(el, 'defaultValue')) {
    const dv = el.defaultValue;
    if (dv.kind === 'expression') addExpr(dv.expression);
    if (dv.kind === 'fromField') refs.add(dv.fieldId);
  }

  // Calculation (formula)
  if ('calculation' in el) {
    const calc = (el as { calculation?: { formula: string; triggeredBy?: string[] } }).calculation;
    if (calc) {
      // Use explicit deps if provided; else parse formula.
      if (calc.triggeredBy?.length) {
        calc.triggeredBy.forEach((r) => refs.add(r));
      } else {
        addExpr(calc.formula);
      }
    }
  }

  // Choice option labels can be piped, and their enabledWhen may reference fields.
  if ('options' in el) {
    const opts = (el as { options: { label: string; enabledWhen?: ConditionGroup }[] }).options;
    for (const opt of opts) {
      addRefs(opt.label);
      addGroup(opt.enabledWhen);
    }
  }

  // Nested groups — recurse
  if (el.type === 'group') {
    for (const child of (el as GroupElement).elements) {
      collectElementRefs(child).forEach((r) => refs.add(r));
    }
  }

  return [...refs];
}

/** All field ids referenced anywhere in a page. */
export function collectPageRefs(page: PageDefinition): string[] {
  const refs = new Set<string>();
  conditionGroupReferences(page.enabledWhen).forEach((r) => refs.add(r));
  for (const el of page.elements) {
    collectElementRefs(el).forEach((r) => refs.add(r));
  }
  return [...refs];
}

/** All field ids referenced anywhere in a form. */
export function collectFormRefs(form: FormDefinition): string[] {
  const refs = new Set<string>();
  for (const page of form.pages) {
    collectPageRefs(page).forEach((r) => refs.add(r));
  }
  return [...refs];
}
