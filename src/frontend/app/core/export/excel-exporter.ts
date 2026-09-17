import { buildColumns } from './columns';
import type { FormDefinition } from '@shared/model/form.model';
import type { Submission } from '@shared/model/submission.model';
import exp from 'exceljs';
const { Workbook } = exp;

export interface ExcelExportOptions {
  sheetName?: string;
  includeSummary?: boolean;
}

/**
 * Export submissions to an .xlsx workbook.
 * - "Responses" sheet: one row per submission (BOM-safe headers, frozen top row).
 * - Optional "Summary" sheet with per-field fill rates.
 */
export async function submissionsToExcel(
  form: FormDefinition,
  submissions: Submission[],
  options: ExcelExportOptions = {},
): Promise<Blob> {
  const workbook = new Workbook();
  workbook.creator = 'FormMaker';
  workbook.created = new Date();

  const columns = buildColumns(form);
  const sheet = workbook.addWorksheet(options.sheetName ?? 'Responses');
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const header: (string | number)[] = columns.map((c) => c.label);
  sheet.addRow(header);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.height = 22;

  for (const submission of submissions) {
    sheet.addRow(columns.map((c) => plainCell(submission.values[c.fieldId])));
  }

  sheet.columns = columns.map((c, i) => ({
    key: String(i),
    width: Math.max(12, Math.min(48, c.label.length + 6)),
  }));

  if (options.includeSummary !== false && submissions.length > 0) {
    const summary = workbook.addWorksheet('Summary');
    summary.addRow(['Field', 'Answered', 'Rate']);
    summary.getRow(1).font = { bold: true };
    for (const column of columns) {
      const answered = submissions.filter((s) => plainCell(s.values[column.fieldId]) !== '').length;
      const rate = (answered / submissions.length) * 100;
      const row = summary.addRow([column.label, answered, `${rate.toFixed(1)}%`]);
      if (rate > 0) row.getCell(2).font = { color: { argb: 'FF2E7D32' } };
    }
    summary.columns = [{ width: 60 }, { width: 12 }, { width: 10 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function plainCell(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'string'
          ? item
          : typeof item === 'object' && 'name' in item
            ? item.name
            : '',
      )
      .filter(Boolean)
      .join(', ');
  }
  return '—';
}
