import { buildColumns } from './columns';
import type { FormDefinition } from '../../shared/model/form.model';
import type { Submission } from '../../shared/model/submission.model';
import type { FieldValue } from '../../shared/model/values.model';
import { formatValueForExport } from './columns';

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
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export type CsvFormatter = (value: FieldValue | undefined) => { text: string };

/** Build a CSV Blob from submissions: one header row per question, one row per submission. */
export function submissionsToCsv(
  form: FormDefinition,
  submissions: Submission[],
  formatter: CsvFormatter = formatValueForExport,
): Blob {
  const columns = buildColumns(form);
  const header = columns.map((c) => c.label);
  const rows = submissions.map((s) => columns.map((c) => formatter(s.values[c.fieldId]).text));
  return toCsv(header, rows);
}
