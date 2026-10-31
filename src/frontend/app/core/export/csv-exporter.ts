import { buildColumns } from './columns';
import type { ElementDefinition, FormDefinition } from '@shared/model/form.model';
import type { Submission } from '@shared/model/submission.model';
import type { FieldValue } from '@shared/model/values.model';
import { formatValueForExport } from './columns';
import type { ExportContext } from './context';

/** RFC-4180-ish CSV serialization (quotes when needed, CRLF). */
export function toCsv(header: string[], rows: (string | number | boolean | null)[][]): Blob {
  const lines: string[] = [];
  const push = (cells: (string | number | boolean | null)[]) => {
    lines.push(cells.map(escapeCell).join(','));
  };
  push(header);
  for (const row of rows) push(row);
  const preamble = '\ufeff'; // BOM for Excel UTF-8 detection
  return new Blob([preamble + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

function escapeCell(value: string | number | boolean | null): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Neutralize spreadsheet formulas (CSV injection); plain numbers stay untouched.
  if (/^[=+\-@\t\r]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export type CsvFormatter = (
  value: FieldValue | undefined,
  element: ElementDefinition | undefined,
) => { text: string };

/** Build a CSV Blob from submissions: one header row per question, one row per submission. */
export function submissionsToCsv(
  form: FormDefinition,
  submissions: Submission[],
  ctx: ExportContext,
  formatter: CsvFormatter = (value, element) => formatValueForExport(value, element, ctx),
): Blob {
  const columns = buildColumns(form);
  const header = columns.map((c) => c.label);
  const rows = submissions.map((s) =>
    columns.map((c) => formatter(s.values[c.fieldId], form.elements[c.fieldId]).text),
  );
  return toCsv(header, rows);
}
