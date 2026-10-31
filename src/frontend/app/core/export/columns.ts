import { isChoice } from '@shared/helper';
import { childrenOf, type ElementParent } from '@shared/model/form-tree';
import type { ElementDefinition, FormDefinition } from '@shared/model/form.model';
import type { Submission } from '@shared/model/submission.model';
import type { FieldValue } from '@shared/model/values.model';
import type { ExportContext } from './context';

export interface ExportColumn {
  /** stable key used to look up the submission value. */
  fieldId: string;
  /** human-readable header. */
  label: string;
}

export type ExportColumnBlock =
  | { kind: 'page'; label: string; indent: number }
  | { kind: 'group'; label: string; indent: number }
  | { kind: 'field'; column: ExportColumn };

export interface ExportTable {
  columns: ExportColumn[];
  rows: Record<string, { text: string; additional?: unknown }>[];
}

/**
 * Flatten the form's questions into ordered export blocks: page headings,
 * then group headings followed by their fields, one level per nesting depth.
 * Sections (visual dividers) are skipped. Page and group headings are only
 * emitted when they contain at least one exported field.
 */
export function buildColumnBlocks(form: FormDefinition): ExportColumnBlock[] {
  const blocks: ExportColumnBlock[] = [];
  let pageNum = 0;
  for (const page of form.pages) {
    pageNum += 1;
    const collect = (parent: ElementParent, path: string[], indent: number): boolean => {
      let emitted = false;
      for (const el of childrenOf(form, parent)) {
        if (el.type === 'group') {
          const start = blocks.length;
          const nested = collect(el, [...path, el.label], indent + 1);
          if (nested) {
            blocks.splice(start, 0, { kind: 'group', label: el.label, indent });
            emitted = true;
          }
        } else if (el.type !== 'section') {
          blocks.push({
            kind: 'field',
            column: { fieldId: el.id, label: buildLabel(pageNum, [...path, el.label]) },
          });
          emitted = true;
        }
      }
      return emitted;
    };
    const start = blocks.length;
    const hasFields = collect(page, [], 0);
    if (hasFields) {
      blocks.splice(start, 0, {
        kind: 'page',
        label: page.title?.trim() || `Page ${pageNum}`,
        indent: 0,
      });
    }
  }
  return blocks;
}

/** Flatten the form's questions into export columns (groups keep a ` / ` path). */
export function buildColumns(form: FormDefinition): ExportColumn[] {
  return buildColumnBlocks(form)
    .filter((b): b is Extract<ExportColumnBlock, { kind: 'field' }> => b.kind === 'field')
    .map((b) => b.column);
}

function buildLabel(pageNum: number, path: string[]): string {
  const joined = path.join(' / ');
  return `P${pageNum}·${joined}`;
}

/**
 * Answers to choice questions hold option ids; replace them with the option labels.
 * Answers whose option was removed from the form after submitting show `export.removedOption`.
 */
export function displayValue(
  value: FieldValue | undefined,
  element: ElementDefinition | undefined,
  ctx: ExportContext,
): FieldValue | undefined {
  if (!element || !isChoice(element) || value === null || value === undefined || value === '') {
    return value;
  }
  const label = (id: unknown): string =>
    element.options.find((o) => o.id === id)?.label ?? ctx.t('export.removedOption');
  return Array.isArray(value) ? value.map(label) : label(value);
}

/** Without an `element`, values are formatted as stored (no option labels). */
export function formatValueForExport(
  raw: FieldValue | undefined,
  element?: ElementDefinition,
  ctx?: ExportContext,
): {
  text: string;
  additional?: unknown;
} {
  const value = element && ctx ? displayValue(raw, element, ctx) : raw;
  if (value === null || value === undefined) return { text: '' };
  if (typeof value === 'string') return { text: value };
  if (typeof value === 'number') return { text: String(value) };
  if (typeof value === 'boolean')
    return { text: value ? 'Yes' : 'No', additional: { boolean: value } };
  if (Array.isArray(value)) {
    return {
      text: value
        .map((item) => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && 'name' in item) return item.name;
          return '';
        })
        .filter(Boolean)
        .join(', '),
    };
  }
  if (typeof value === 'object') {
    if ('dataUrl' in value) return { text: '[signature]', additional: { dataUrl: value.dataUrl } };
    return { text: '[attachment]', additional: value };
  }
  return { text: '' };
}

export function rowForSubmission(
  form: FormDefinition,
  submission: Submission,
  columns: ExportColumn[],
  ctx: ExportContext,
): Record<string, { text: string; additional?: unknown }> {
  const row: Record<string, { text: string; additional?: unknown }> = {};
  for (const column of columns) {
    row[column.fieldId] = formatValueForExport(
      submission.values[column.fieldId],
      form.elements[column.fieldId],
      ctx,
    );
  }
  return row;
}

export function buildExportTable(
  form: FormDefinition,
  submissions: Submission[],
  ctx: ExportContext,
): ExportTable {
  const columns = buildColumns(form);
  return {
    columns,
    rows: submissions.map((s) => rowForSubmission(form, s, columns, ctx)),
  };
}

export function tableToMd(table: ExportTable): string {
  const headers = table.columns.map((c) => c.label);
  const lines = [
    [
      { text: 'Submitted' },
      { text: 'Duration (s)' },
      ...headers.map((h) => ({
        text: h,
      })),
    ],
    ...table.rows.map((r) => {
      const values = table.columns.map((c) => r[c.fieldId] ?? '');
      return [{ text: '' }, { text: '' }, ...values];
    }),
  ];
  return lines
    .map((row, i) => {
      const cells = row.map((c) => c.text.replace(/\|/g, '\\|'));
      const body = cells.join(' | ');
      if (i === 0) return `| ${body} |\n| ${cells.map(() => '---').join(' | ')} |`;
      return `| ${body} |`;
    })
    .join('\n');
}
