import {
  type FormDefinition,
  type ElementDefinition,
  type Elements,
  ELEMENT_TYPES,
} from '../../shared/model/form.model';
import { CONDITION_OPERATORS } from '../../shared/model/conditions.model';
import { VALIDATION_RULE_TYPES } from '../../shared/model/validation.model';
import { expressionReferences } from '../engine/expression/evaluator';
import { templateReferences } from '../engine/expression/template';
import { conditionGroupReferences } from '../engine/condition-engine';
import { has } from '../../shared/helper';

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Validate a parsed form definition; returns a list of issues (empty = valid). */
export function validateFormDefinition(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (input === null || typeof input !== 'object') {
    return [{ path: '$', message: 'Not a JSON object' }];
  }
  const form = input as Partial<FormDefinition>;

  if (typeof form.id !== 'string' || !form.id) issues.push({ path: 'id', message: 'Missing id' });
  if (typeof form.name !== 'string' || !form.name)
    issues.push({ path: 'name', message: 'Missing name' });
  if (typeof form.version !== 'number')
    issues.push({ path: 'version', message: 'Missing numeric version' });
  if (form.schemaVersion !== 1)
    issues.push({ path: 'schemaVersion', message: 'Unsupported schemaVersion' });

  if (!Array.isArray(form.pages)) {
    issues.push({ path: 'pages', message: 'Missing pages array' });
    return issues;
  }

  const allIds = new Set<string>();
  const pageIds = new Set<string>();

  form.pages.forEach((page, pi) => {
    const path = `pages[${pi}]`;
    if (!page || typeof page !== 'object') {
      issues.push({ path, message: 'Page is not an object' });
      return;
    }
    if (typeof page.id !== 'string' || !page.id)
      issues.push({ path: `${path}.id`, message: 'Missing page id' });
    else if (pageIds.has(page.id))
      issues.push({ path: `${path}.id`, message: `Duplicate page id ${page.id}` });
    else pageIds.add(page.id);

    if (page.enabledWhen) {
      const groupIssues = validateConditionGroup(page.enabledWhen);
      groupIssues.forEach((i) =>
        issues.push({ path: `${path}.enabledWhen.${i.path}`, message: i.message }),
      );
    }

    if (!Array.isArray(page.elements)) {
      issues.push({ path: `${path}.elements`, message: 'Missing elements array' });
      return;
    }
    page.elements.forEach((el, ei) =>
      validateElement(el, `${path}.elements[${ei}]`, issues, allIds),
    );
  });

  // Reference checks (fields referenced by conditions/pipes/calcs must exist).
  const knownId = (id: string) => allIds.has(id);
  form.pages.forEach((page, pi) => {
    const path = `pages[${pi}]`;
    page?.elements?.forEach((el, ei) => {
      validateReferences(el, `${path}.elements[${ei}]`, issues, knownId);
    });
  });

  return issues;
}

function validateElement(
  element: unknown,
  path: string,
  issues: ValidationIssue[],
  allIds: Set<string>,
): void {
  if (!element || typeof element !== 'object') {
    issues.push({ path, message: 'Element is not an object' });
    return;
  }
  const el = element as ElementDefinition;
  if (typeof el.type !== 'string') {
    issues.push({ path: `${path}.type`, message: 'Missing type' });
    return;
  }

  if (!ELEMENT_TYPES.includes(el.type)) {
    issues.push({ path: `${path}.type`, message: `Unknown element type "${el.type}"` });
  }
  if (typeof el.id !== 'string' || !el.id)
    issues.push({ path: `${path}.id`, message: 'Missing element id' });
  else if (allIds.has(el.id))
    issues.push({ path: `${path}.id`, message: `Duplicate element id ${el.id}` });
  else allIds.add(el.id);

  if (typeof el.label !== 'string')
    issues.push({ path: `${path}.label`, message: 'Missing label' });

  const validTypes = CONDITION_OPERATORS;
  if (el.enabledWhen) {
    const groupIssues = validateConditionGroup(el.enabledWhen, validTypes);
    groupIssues.forEach((i) =>
      issues.push({ path: `${path}.enabledWhen.${i.path}`, message: i.message }),
    );
  }

  if (has(el, 'validations') && Array.isArray(el.validations)) {
    el.validations.forEach((rule, ri) => {
      const known = VALIDATION_RULE_TYPES.map((t) => t.type);
      if (!rule || !known.includes(rule.rule)) {
        issues.push({
          path: `${path}.validations[${ri}].rule`,
          message: `Unknown validation rule "${(rule as { rule?: string })?.rule}"`,
        });
      }
    });
  }

  if (el.type === 'choice' || el.type === 'dropdown' || el.type === 'multiChoice') {
    const options = (el as { options?: unknown[] }).options;
    if (!Array.isArray(options) || options.length === 0) {
      issues.push({ path: `${path}.options`, message: 'Choice elements need options' });
    }
  }

  if (el.type === 'group') {
    const elements = (el as ElementDefinition & { elements?: Elements }).elements;
    if (!Array.isArray(elements))
      issues.push({ path: `${path}.elements`, message: 'Group needs elements array' });
    else
      elements.forEach((child, ci) =>
        validateElement(child, `${path}.elements[${ci}]`, issues, allIds),
      );
  }
}

function validateConditionGroup(
  group: unknown,
  operators: readonly string[] = CONDITION_OPERATORS,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!group || typeof group !== 'object') {
    return [{ path: '$', message: 'Condition group is not an object' }];
  }
  const g = group as { logic?: unknown; conditions?: unknown; groups?: unknown };
  if (g.logic !== 'all' && g.logic !== 'any')
    issues.push({ path: 'logic', message: 'logic must be all|any' });
  if (Array.isArray(g.conditions)) {
    g.conditions.forEach((c, i) => {
      const cond = c as { operator?: string; fieldId?: string };
      if (cond && typeof cond.operator === 'string' && !operators.includes(cond.operator)) {
        issues.push({
          path: `conditions[${i}].operator`,
          message: `Unknown operator "${cond.operator}"`,
        });
      }
      if (cond && !cond.fieldId)
        issues.push({ path: `conditions[${i}].fieldId`, message: 'Missing fieldId' });
    });
  }
  if (Array.isArray(g.groups)) {
    g.groups.forEach((nested, i) => {
      validateConditionGroup(nested, operators).forEach((inner) =>
        issues.push({ path: `groups[${i}].${inner.path}`, message: inner.message }),
      );
    });
  }
  return issues;
}

function validateReferences(
  el: ElementDefinition,
  path: string,
  issues: ValidationIssue[],
  knownId: (id: string) => boolean,
): void {
  const ref = (id: string, where: string) => {
    if (knownId(id)) return;
    issues.push({ path: `${path}.${where}`, message: `Unknown reference to "${id}"` });
  };

  for (const t of [el.label, el.description, has(el, 'placeholder') ? el.placeholder : '']) {
    for (const id of templateReferences(t ?? '')) ref(id, 'text');
  }
  if (el.enabledWhen) {
    for (const id of conditionGroupReferences(el.enabledWhen)) ref(id, 'enabledWhen');
  }
  if (has(el, 'defaultValue')) {
    if (el.defaultValue?.kind === 'fromField') ref(el.defaultValue.fieldId, 'defaultValue');
    if (el.defaultValue?.kind === 'expression') {
      for (const id of expressionReferences(el.defaultValue.expression)) ref(id, 'defaultValue');
    }
  }
  if (has(el, 'validations')) {
    for (const rule of el.validations) {
      if (rule.expression)
        for (const id of expressionReferences(rule.expression)) ref(id, 'validations');
      if (rule.message) for (const id of templateReferences(rule.message)) ref(id, 'validations');
    }
  }
  if (el.type === 'choice' || el.type === 'dropdown' || el.type === 'multiChoice') {
    const opts = (
      el as {
        options: { label: string; enabledWhen?: Parameters<typeof conditionGroupReferences>[0] }[];
      }
    ).options;
    for (const opt of opts) {
      for (const id of templateReferences(opt.label)) ref(id, 'options');
      if (opt.enabledWhen)
        for (const id of conditionGroupReferences(opt.enabledWhen)) ref(id, 'options');
    }
  }
  if (el.type === 'group') {
    (el as ElementDefinition & { elements: Elements }).elements.forEach((child, ci) =>
      validateReferences(child, `${path}.elements[${ci}]`, issues, knownId),
    );
  }
}

export function isFormDefinition(input: unknown): input is FormDefinition {
  return validateFormDefinition(input).length === 0;
}
