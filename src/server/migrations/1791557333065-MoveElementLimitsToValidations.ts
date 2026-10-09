import crypto from 'node:crypto';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Element properties that became validation rules of the same name, by element type. */
const LEGACY_LIMITS = new Map<string, readonly string[]>([
  ['text', ['maxLength']],
  ['longText', ['maxLength']],
  ['number', ['min', 'max']],
]);

/** Value `createElement` used to add to every new text field. */
const LEGACY_DEFAULT_MAX_LENGTH = 255;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Whether a legacy limit was chosen by the author and should become a rule. */
function isAuthoredLimit(property: string, value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (property !== 'maxLength') return true;
  return value > 0 && value !== LEGACY_DEFAULT_MAX_LENGTH;
}

/**
 * Removes the legacy limit properties from elements (recursing into groups).
 * Authored limits become a validation rule of the same name unless the element
 * already has one; the automatic `maxLength` default of 255 is dropped.
 * Returns whether anything changed.
 */
function migrateElements(elements: unknown): boolean {
  if (!Array.isArray(elements)) return false;
  let changed = false;
  for (const el of elements) {
    if (!isObject(el)) continue;
    if (migrateElements(el.elements)) changed = true;
    const properties = typeof el.type === 'string' ? LEGACY_LIMITS.get(el.type) : undefined;
    for (const property of properties ?? []) {
      if (!(property in el)) continue;

      const value = el[property];
      delete el[property];
      changed = true;

      if (!isAuthoredLimit(property, value)) continue;
      const validations = Array.isArray(el.validations) ? el.validations : [];
      if (validations.some((rule) => isObject(rule) && rule.rule === property)) continue;
      el.validations = [
        ...validations,
        { id: crypto.randomUUID(), rule: property, value, message: 'This value is invalid' },
      ];
    }
  }
  return changed;
}

/**
 * Text and long-text elements no longer have a `maxLength` property, and
 * number elements no longer have `min` / `max`; these limits are expressed
 * with validation rules of the same name. The element schemas are strict, so
 * stored documents that still carry the keys would no longer parse.
 */
export class MoveElementLimitsToValidations1791557333065 implements MigrationInterface {
  name = 'MoveElementLimitsToValidations1791557333065';

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows: { id: string; document: string }[] = await queryRunner.query(
      'SELECT id, document FROM forms',
    );
    for (const row of rows) {
      let form: unknown;
      try {
        form = JSON.parse(row.document);
      } catch {
        continue;
      }
      if (!isObject(form) || !Array.isArray(form.pages)) continue;

      let changed = false;
      for (const page of form.pages) {
        if (isObject(page) && migrateElements(page.elements)) changed = true;
      }
      if (!changed) continue;

      await queryRunner.query('UPDATE forms SET document = ? WHERE id = ?', [
        JSON.stringify(form),
        row.id,
      ]);
    }
  }

  /** The previous schema accepts documents without these keys, so there is nothing to undo. */
  async down(): Promise<void> {
    /* empty */
  }
}
