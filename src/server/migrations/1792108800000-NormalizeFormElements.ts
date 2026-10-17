import crypto from 'node:crypto';
import type { MigrationInterface, QueryRunner } from 'typeorm';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Moves inline children (`page.elements`, `group.elements`) into a flat element
 * map and replaces them with `children` id lists. An element id seen twice gets
 * a fresh one, so no element is lost when they are keyed by id.
 */
function flatten(form: JsonObject, pages: unknown[]): JsonObject {
  const elements: Record<string, JsonObject> = {};
  const childIds = (nodes: unknown): string[] => {
    if (!Array.isArray(nodes)) return [];
    return nodes.filter(isObject).map(({ elements: nested, ...el }) => {
      const given = el.id;
      const id =
        typeof given === 'string' && !Object.hasOwn(elements, given)
          ? given
          : `q_${crypto.randomUUID()}`;
      el.id = id;
      elements[id] = el;
      if (el.type === 'group') el.children = childIds(nested);
      return id;
    });
  };
  return {
    ...form,
    schemaVersion: 2,
    pages: pages
      .filter(isObject)
      .map(({ elements: nodes, ...page }) => ({ ...page, children: childIds(nodes) })),
    elements,
  };
}

/** Inverse of `flatten`: nests the elements back under their page or group. */
function nest(form: JsonObject, pages: unknown[], elements: JsonObject): JsonObject {
  const resolve = (ids: unknown): JsonObject[] => {
    if (!Array.isArray(ids)) return [];
    return ids.flatMap((id) => {
      const stored = typeof id === 'string' ? elements[id] : undefined;
      if (!isObject(stored)) return [];
      const { children, ...el } = stored;
      return [el.type === 'group' ? { ...el, elements: resolve(children) } : el];
    });
  };
  const { elements: _elements, ...rest } = form;
  return {
    ...rest,
    schemaVersion: 1,
    pages: pages
      .filter(isObject)
      .map(({ children, ...page }) => ({ ...page, elements: resolve(children) })),
  };
}

async function rewriteForms(
  queryRunner: QueryRunner,
  convert: (form: JsonObject) => JsonObject | null,
): Promise<void> {
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
    const converted = isObject(form) ? convert(form) : null;
    if (!converted) continue;
    await queryRunner.query('UPDATE forms SET document = ? WHERE id = ?', [
      JSON.stringify(converted),
      row.id,
    ]);
  }
}

/**
 * Form documents (schema version 2) keep every element in one `elements` map
 * keyed by id; pages and groups list their children by id instead of nesting
 * them. Editing one element no longer means rebuilding the tree around it.
 */
export class NormalizeFormElements1792108800000 implements MigrationInterface {
  name = 'NormalizeFormElements1792108800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await rewriteForms(queryRunner, (form) =>
      form.schemaVersion === 1 && Array.isArray(form.pages) ? flatten(form, form.pages) : null,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await rewriteForms(queryRunner, (form) =>
      form.schemaVersion === 2 && Array.isArray(form.pages) && isObject(form.elements)
        ? nest(form, form.pages, form.elements)
        : null,
    );
  }
}
