import type { FormDefinition, Elements } from '../model/form.model';
import type { Submission } from '../model/submission.model';
import type { FieldValue } from '../model/values.model';

export interface ExportColumn {
  /** stable key used to look up the submission value. */
  fieldId: string;
  /** human-readable header. */
  label: string;
}

export interface ExportTable {
  columns: ExportColumn[];
  rows: Record<string, string>[];
}

/** Flatten the form's questions into export columns (groups keep a ` / ` path). */
export function buildColumns(form: FormDefinition): ExportColumn[] {
  const columns: ExportColumn[] = [];
  let pageNum = 0;
  for (const page of form.pages) {
    pageNum += 1;
    const collect = (elements: Elements, path: string[]) => {
      for (const el of elements) {
        if (el.type === 'group') {
          collect((el as { elements: Elements }).elements, [...path, el.label]);
        } else if (el.type !== 'section') {
          const label = buildLabel(pageNum, [...path, el.label]);
          columns.push({ fieldId: el.id, label });
        }
      }
    };
    collect(page.elements, []);
  }
  return columns;
}

function buildLabel(pageNum: number, path: string[]): string {
  const joined = path.join(' / ');
  return `P${pageNum}·${joined}`;
}

export function formatValueForExport(value: FieldValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && 'name' in item) return item.name;
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    if ('dataUrl' in value) return '[signature]';
    return '[attachment]';
  }
  return '';
}

export function rowForSubmission(
  submission: Submission,
  columns: ExportColumn[],
): Record<string, string> {
  const row: Record<string, string> = {};
  for (const column of columns) {
    row[column.fieldId] = formatValueForExport(submission.values[column.fieldId]);
  }
  return row;
}

export function buildExportTable(form: FormDefinition, submissions: Submission[]): ExportTable {
  const columns = buildColumns(form);
  return {
    columns,
    rows: submissions.map((s) => rowForSubmission(s, columns)),
  };
}

export function tableToMd(table: ExportTable): string {
  const headers = table.columns.map((c) => c.label);
  const lines = [
    ['Submitted', 'Duration (s)', ...headers],
    ...table.rows.map((r) => {
      const values = table.columns.map((c) => r[c.fieldId] ?? '');
      return ['', '', ...values];
    }),
  ];
  return lines
    .map((row, i) => {
      const cells = row.map((c) => c.replace(/\|/g, '\\|'));
      const body = cells.join(' | ');
      if (i === 0) return `| ${body} |\n| ${cells.map(() => '---').join(' | ')} |`;
      return `| ${body} |`;
    })
    .join('\n');
}
