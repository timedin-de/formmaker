import { isQuestionOrGroup } from '../helper';
import type { ConditionGroup } from '../model/conditions.model';
import { childrenOf } from '../model/form-tree';
import type { ElementDefinition, FormDefinition, QuestionDefinition } from '../model/form.model';
import type { FieldValue } from '../model/values.model';
import { conditionGroupReferences, evalConditionGroup } from './condition-engine';
import { expressionReferences } from './expression/evaluator';
import { validateElementValue } from './validators';

/**
 * Whether an element is in the flow of a submission. `unknown` when its
 * condition (or a parent's) reads an answer the server cannot see.
 */
type Visibility = 'visible' | 'hidden' | 'unknown';

/**
 * Re-checks submitted answers against the form: every visible question must
 * be valid, hidden and unknown elements must have no value.
 *
 * `opaque` holds the ids of encrypted questions. Their answers are not in
 * `values` and cannot be checked here, so:
 * - they must not appear in `values` at all,
 * - an element whose visibility depends on one is validated only when it has
 *   a value (it may have been hidden in the browser),
 * - custom rules that read one are skipped.
 *
 * Returns the first problem as a message, or null when the answers are valid.
 */
export function submissionIssue(
  form: FormDefinition,
  values: Readonly<Record<string, FieldValue>>,
  opaque: ReadonlySet<string> = new Set(),
): string | null {
  for (const id of Object.keys(values)) {
    if (opaque.has(id))
      return `submission contains a plain text value for encrypted element: ${id}`;
  }

  const seen = new Set<string>();
  const visibility = (group: ConditionGroup | undefined, parent: Visibility): Visibility => {
    if (parent === 'hidden') return 'hidden';
    if (conditionGroupReferences(group).some((id) => opaque.has(id))) return 'unknown';
    if (!evalConditionGroup(group, values)) return 'hidden';
    return parent;
  };

  const check = (e: ElementDefinition, parent: Visibility): string | null => {
    if (!isQuestionOrGroup(e)) return null;
    const visible = visibility(e.enabledWhen, parent);
    if (e.type === 'group') {
      for (const child of childrenOf(form, e)) {
        const issue = check(child, visible);
        if (issue) return issue;
      }
      return null;
    }
    if (opaque.has(e.id)) return null;

    const value = values[e.id];
    if (visible === 'hidden') {
      return value === undefined
        ? null
        : `submission contains value for invisible element: ${e.id}`;
    }
    if (value !== undefined) seen.add(e.id);
    // Possibly hidden in the browser: an absent answer is fine, a given one must be valid.
    if (visible === 'unknown' && value === undefined) return null;

    const validation = validateElementValue(withoutOpaqueRules(e, opaque), value, values);
    if (validation.valid) return null;
    return `value for field ${e.id} is invalid: ${validation.failures.map((x) => x.message).join(', ')}`;
  };

  for (const page of form.pages) {
    const visible = visibility(page.enabledWhen, 'visible');
    for (const el of childrenOf(form, page)) {
      const issue = check(el, visible);
      if (issue) return issue;
    }
  }

  const unknown = Object.keys(values).find((id) => !seen.has(id));
  return unknown ? `submission contains value for non-existent element: ${unknown}` : null;
}

/** The question without custom rules whose expression reads an encrypted answer. */
function withoutOpaqueRules(
  element: QuestionDefinition,
  opaque: ReadonlySet<string>,
): QuestionDefinition {
  if (opaque.size === 0) return element;
  const validations = element.validations.filter(
    (rule) =>
      rule.rule !== 'custom' ||
      !rule.expression ||
      !expressionReferences(rule.expression).some((id) => opaque.has(id)),
  );
  return validations.length === element.validations.length ? element : { ...element, validations };
}
