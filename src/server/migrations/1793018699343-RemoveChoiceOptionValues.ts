import type { MigrationInterface, QueryRunner } from 'typeorm';

const CHOICE_TYPES = new Set(['choice', 'dropdown', 'multiChoice']);

type JsonObject = Record<string, unknown>;

/** Option id by `String(value)`, per choice element id. */
type OptionIds = Map<string, Map<string, string>>;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isChoice(el: JsonObject): el is JsonObject & { options: unknown[] } {
  return typeof el.type === 'string' && CHOICE_TYPES.has(el.type) && Array.isArray(el.options);
}

/**
 * Removes `value` from every choice option and returns the option id each
 * value stood for. When two options share a value, the first one wins, as it
 * did when answers were matched by value.
 */
function stripOptionValues(elements: JsonObject): OptionIds {
  const byElement: OptionIds = new Map();
  for (const [id, el] of Object.entries(elements)) {
    if (!isObject(el) || !isChoice(el)) continue;
    const ids = new Map<string, string>();
    el.options = el.options.map((option) => {
      if (!isObject(option)) return option;
      const { value, ...rest } = option;
      const key = typeof value === 'string' || typeof value === 'number' ? String(value) : null;
      if (key !== null && typeof rest.id === 'string' && !ids.has(key)) {
        ids.set(key, rest.id);
      }
      return rest;
    });
    byElement.set(id, ids);
  }
  return byElement;
}

/** Replaces an option value (or a list of them) with the option's id. */
function toId(ids: Map<string, string>, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => toId(ids, v));
  if (typeof value !== 'string' && typeof value !== 'number') return value;
  return ids.get(String(value)) ?? value;
}

/** Rewrites literal operands of every condition on a choice field, wherever it is nested. */
function migrateConditions(node: unknown, byElement: OptionIds): void {
  if (Array.isArray(node)) {
    for (const child of node) migrateConditions(child, byElement);
    return;
  }
  if (!isObject(node)) return;
  const ids =
    typeof node.fieldId === 'string' && 'operator' in node
      ? byElement.get(node.fieldId)
      : undefined;
  if (ids) {
    for (const key of ['operand', 'operandTo']) {
      const operand = node[key];
      if (isObject(operand) && operand.kind === 'literal') {
        operand.value = toId(ids, operand.value);
      }
    }
    if (Array.isArray(node.values)) node.values = toId(ids, node.values);
  }
  for (const child of Object.values(node)) migrateConditions(child, byElement);
}

function migrateForm(form: JsonObject): OptionIds {
  if (!isObject(form.elements)) return new Map();
  const byElement = stripOptionValues(form.elements);
  for (const [id, ids] of byElement) {
    const el = form.elements[id];
    if (isObject(el) && isObject(el.defaultValue) && el.defaultValue.kind === 'static') {
      el.defaultValue.value = toId(ids, el.defaultValue.value);
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
 * id. Strips the key from stored forms (the element schemas are strict) and
 * replaces option values with their option ids in static default values,
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
        for (const [id, ids] of byElement) {
          if (id in values) values[id] = toId(ids, values[id]);
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
   * Gives every option its id as value again. Answers, defaults and
   * conditions keep the ids, which are then valid option values.
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
          isObject(option) ? { ...option, value: option.id } : option,
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
