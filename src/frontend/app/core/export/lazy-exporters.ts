import type { FormDefinition, NamedFormDefinition, Submission } from '@shared/model';
import type { ExcelExportOptions } from './excel-exporter';

export async function submissionsToPdf(form: NamedFormDefinition, submissions: Submission[]) {
  const exporterFn = await import('./pdf-exporter').then((x) => x.submissionsToPdf);
  return exporterFn(form, submissions);
}
export async function submissionToPdf(form: NamedFormDefinition, submission: Submission) {
  const exporterFn = await import('./pdf-exporter').then((x) => x.submissionToPdf);
  return exporterFn(form, submission);
}

export async function submissionsToExcel(
  form: FormDefinition,
  submissions: Submission[],
  options: ExcelExportOptions = {},
) {
  const exporterFn = await import('./excel-exporter').then((x) => x.submissionsToExcel);
  return exporterFn(form, submissions, options);
}
