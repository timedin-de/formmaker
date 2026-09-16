import type { FormDefinition } from '@shared/model/form.model';
import type { Submission } from '@shared/model/submission.model';
import { submissionsToCsv } from './csv-exporter';
import { submissionsToExcel } from './excel-exporter';
import { submissionsToPdf } from './pdf-exporter';
import { toSlug } from './file';

export type ExportChannelId = 'csv' | 'xlsx' | 'pdf' | 'mail';

export type ExportArtifact =
  { kind: 'download'; blob: Blob; filename: string } | { kind: 'link'; url: string };

export interface ExportContext {
  /** Translate a UI string; keeps channels framework-free yet localizable. */
  t(key: string, params?: Record<string, string | number>): string;
}

/**
 * A pluggable "results output": anything that turns a form + its submissions
 * into something the user can consume (file download, link, …). Register a new
 * implementation in EXPORT_CHANNELS to add a button to the results toolbar.
 */
export interface ExportChannel {
  readonly id: ExportChannelId;
  /** I18n key for the action button label. */
  readonly labelKey: string;
  readonly icon: string;
  /** I18n key for the success message; defaults to 'export.exported'. */
  readonly doneKey?: string;
  build(
    form: FormDefinition,
    submissions: Submission[],
    ctx: ExportContext,
  ): Promise<ExportArtifact>;
}

function exportFileName(name: string, ext: string): string {
  return `${toSlug(name)}-responses.${ext}`;
}

export const csvChannel: ExportChannel = {
  id: 'csv',
  labelKey: 'results.csv',
  icon: 'download',
  build(form, submissions) {
    return Promise.resolve({
      kind: 'download',
      blob: submissionsToCsv(form, submissions),
      filename: exportFileName(form.name, 'csv'),
    });
  },
};

export const excelChannel: ExportChannel = {
  id: 'xlsx',
  labelKey: 'results.excel',
  icon: 'table_view',
  async build(form, submissions) {
    return {
      kind: 'download',
      blob: await submissionsToExcel(form, submissions),
      filename: exportFileName(form.name, 'xlsx'),
    };
  },
};

export const pdfChannel: ExportChannel = {
  id: 'pdf',
  labelKey: 'results.pdf',
  icon: 'picture_as_pdf',
  doneKey: 'export.exported',
  async build(form, submissions) {
    return {
      kind: 'download',
      blob: await submissionsToPdf(form, submissions),
      filename: exportFileName(form.name, 'pdf'),
    };
  },
};

/**
 * Example plug-in output: hand the results off to the user's mail client as a
 * summary (no attachment, no server-side SMTP dependency).
 */
export const mailChannel: ExportChannel = {
  id: 'mail',
  labelKey: 'results.email',
  icon: 'mail',
  doneKey: 'export.exported',
  build(form, submissions, ctx) {
    const times = submissions.map((s) => new Date(s.submittedAt).getTime()).sort((a, b) => a - b);
    const range = times.length
      ? `${new Date(times[0]).toLocaleString()} – ${new Date(times[times.length - 1]).toLocaleString()}`
      : '';
    const subject = ctx.t('results.mailSubject', {
      name: form.name,
      n: String(submissions.length),
    });
    const body = ctx.t('results.mailBody', {
      name: form.name,
      n: String(submissions.length),
      range,
    });
    return Promise.resolve({
      kind: 'link',
      url: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    });
  },
};

export const EXPORT_CHANNELS: ExportChannel[] = [csvChannel, excelChannel, pdfChannel, mailChannel];
