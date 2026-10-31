import type { FormDefinition, NamedFormDefinition, Submission } from '@shared/model';
import type { ExportContext } from './context';
import type { ExcelExportOptions } from './excel-exporter';

export async function submissionsToPdf(
  form: NamedFormDefinition,
  submissions: Submission[],
  ctx: ExportContext,
) {
  const exporterFn = await import('./pdf-exporter').then((x) => x.submissionsToPdf);
  return exporterFn(form, submissions, ctx);
}
export async function submissionToPdf(
  form: NamedFormDefinition,
  submission: Submission,
  ctx: ExportContext,
) {
  const exporterFn = await import('./pdf-exporter').then((x) => x.submissionToPdf);
  return exporterFn(form, submission, ctx);
}

export async function submissionsToExcel(
  form: FormDefinition,
  submissions: Submission[],
  ctx: ExportContext,
  options: ExcelExportOptions = {},
) {
  const exporterFn = await import('./excel-exporter').then((x) => x.submissionsToExcel);
  return exporterFn(form, submissions, ctx, options);
}
