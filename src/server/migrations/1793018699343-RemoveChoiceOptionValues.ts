import type { MigrationInterface, QueryRunner } from 'typeorm';

const CHOICE_TYPES = new Set(['choice', 'dropdown', 'multiChoice']);

type JsonObject = Record<string, unknown>;

/** Option label by `String(value)`, per choice element id. */
type OptionLabels = Map<string, Map<string, string>>;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isChoice(el: JsonObject): el is JsonObject & { options: unknown[] } {
  return typeof el.type === 'string' && CHOICE_TYPES.has(el.type) && Array.isArray(el.options);
}

/**
 * Removes `value` from every choice option and returns the label each value
 * stood for. When two options share a value, the first one wins, as it did
 * when answers were matched by value.
 */
function stripOptionValues(elements: JsonObject): OptionLabels {
  const byElement: OptionLabels = new Map();
  for (const [id, el] of Object.entries(elements)) {
    if (!isObject(el) || !isChoice(el)) continue;
    const labels = new Map<string, string>();
    el.options = el.options.map((option) => {
      if (!isObject(option)) return option;
      const { value, ...rest } = option;
      const key = typeof value === 'string' || typeof value === 'number' ? String(value) : null;
      if (key !== null && typeof rest.label === 'string' && !labels.has(key)) {
        labels.set(key, rest.label);
      }
      return rest;
    });
    byElement.set(id, labels);
  }
  return byElement;
}

/** Replaces an option value (or a list of them) with the option's label. */
function toLabel(labels: Map<string, string>, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => toLabel(labels, v));
  if (typeof value !== 'string' && typeof value !== 'number') return value;
  return labels.get(String(value)) ?? value;
}

/** Rewrites literal operands of every condition on a choice field, wherever it is nested. */
function migrateConditions(node: unknown, byElement: OptionLabels): void {
  if (Array.isArray(node)) {
    for (const child of node) migrateConditions(child, byElement);
    return;
  }
  if (!isObject(node)) return;
  const labels =
    typeof node.fieldId === 'string' && 'operator' in node ? byElement.get(node.fieldId) : undefined;
  if (labels) {
    for (const key of ['operand', 'operandTo']) {
      const operand = node[key];
      if (isObject(operand) && operand.kind === 'literal') {
        operand.value = toLabel(labels, operand.value);
      }
    }
    if (Array.isArray(node.values)) node.values = toLabel(labels, node.values);
  }
  for (const child of Object.values(node)) migrateConditions(child, byElement);
}

function migrateForm(form: JsonObject): OptionLabels {
  if (!isObject(form.elements)) return new Map();
  const byElement = stripOptionValues(form.elements);
  for (const [id, labels] of byElement) {
    const el = form.elements[id];
    if (isObject(el) && isObject(el.defaultValue) && el.defaultValue.kind === 'static') {
      el.defaultValue.value = toLabel(labels, el.defaultValue.value);
    }
  }
  migrateConditions(form, byElement);
  return byElement;
}

function parse(document: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(document);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Choice options no longer have a separate `value`: answers store the option
 * label. Strips the key from stored forms (the element schemas are strict) and
 * replaces option values with their labels in static default values,
 * conditions on choice fields, and submitted answers.
 */
export class RemoveChoiceOptionValues1793018699343 implements MigrationInterface {
  name = 'RemoveChoiceOptionValues1793018699343';

  async up(queryRunner: QueryRunner): Promise<void> {
    const forms: { id: string; document: string }[] = await queryRunner.query(
      'SELECT id, document FROM forms',
    );
    for (const row of forms) {
      const form = parse(row.document);
      if (!form) continue;
      const byElement = migrateForm(form);
      if (byElement.size === 0) continue;

      await queryRunner.query('UPDATE forms SET document = ? WHERE id = ?', [
        JSON.stringify(form),
        row.id,
      ]);

      const submissions: { id: string; document: string }[] = await queryRunner.query(
        'SELECT id, document FROM submissions WHERE form_id = ?',
        [row.id],
      );
      for (const sub of submissions) {
        const submission = parse(sub.document);
        if (!submission || !isObject(submission.values)) continue;
        const values = submission.values;
        for (const [id, labels] of byElement) {
          if (id in values) values[id] = toLabel(labels, values[id]);
        }
        const document = JSON.stringify(submission);
        if (document === sub.document) continue;
        await queryRunner.query('UPDATE submissions SET document = ? WHERE id = ?', [
          document,
          sub.id,
        ]);
      }
    }
  }

  /**
   * Gives every option its label as value again. Answers keep the labels,
   * which are then valid option values.
   */
  async down(queryRunner: QueryRunner): Promise<void> {
    const forms: { id: string; document: string }[] = await queryRunner.query(
      'SELECT id, document FROM forms',
    );
    for (const row of forms) {
      const form = parse(row.document);
      if (!form || !isObject(form.elements)) continue;
      let changed = false;
      for (const el of Object.values(form.elements)) {
        if (!isObject(el) || !isChoice(el)) continue;
        el.options = el.options.map((option) =>
          isObject(option) ? { ...option, value: option.label } : option,
        );
        changed = true;
      }
      if (!changed) continue;
      await queryRunner.query('UPDATE forms SET document = ? WHERE id = ?', [
        JSON.stringify(form),
        row.id,
      ]);
    }
  }
}
