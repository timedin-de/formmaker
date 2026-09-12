import { jsPDF } from 'jspdf';
import { buildColumns, formatValueForExport } from './columns';
import type { FormDefinition, Elements } from '../../shared/model/form.model';
import type { Submission } from '../../shared/model/submission.model';

const PAGE_W = 595; // A4 portrait, pt
const PAGE_H = 842;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

/**
 * Render a compact PDF summary: a form overview, per-field fill-rate table,
 * and a flat list of all submissions.
 */
export async function submissionsToPdf(
  form: FormDefinition,
  submissions: Submission[],
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const columns = buildColumns(form);
  let y = MARGIN;

  const ensureSpace = (needed = 60): void => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // --- header ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text(form.name, MARGIN, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  const meta = [
    `v${form.version}`,
    `${form.pages.length} pages`,
    `${countQuestions(form)} questions`,
    `${submissions.length} submission(s)`,
    new Date().toLocaleDateString(),
  ].join(' · ');
  doc.text(meta, MARGIN, y);
  y += 22;
  if (form.description) {
    doc.text(wrap(doc, form.description, CONTENT_W), MARGIN, y);
    y += 14;
  }

  // --- summary table ---
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text(drawWord(doc, 'Results summary'), MARGIN, y + 12);
  y += 20;

  const answeredOf = (fieldId: string): number =>
    submissions.filter((s) => formatValueForExport(s.values[fieldId]).text !== '').length;

  const colW = Math.min(220, CONTENT_W * 0.6);
  const rateW = 70;
  const ansW = CONTENT_W - colW - rateW - 2 * 12;

  const rowH = 18;
  doc.setFillColor(241, 243, 245);
  doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text(drawWord(doc, 'Field'), MARGIN + 12, y + 12);
  doc.text('Answered', MARGIN + 12 + colW, y + 12);
  doc.text('Rate', MARGIN + 12 + colW + ansW, y + 12);
  y += rowH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    ensureSpace(rowH * 2);
    if ((i + 1) % 2 === 0) doc.setFillColor(248, 249, 250);
    else doc.setFillColor(255, 255, 255);
    doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');
    doc.setTextColor(60, 60, 60);
    doc.text(wrap(doc, col.label, colW - 24), MARGIN + 12, y + 12);
    const answered = answeredOf(col.fieldId);
    doc.text(String(answered), MARGIN + 12 + colW, y + 12);
    const pct = submissions.length ? Math.round((answered / submissions.length) * 100) : 0;
    doc.text(`${pct}%`, MARGIN + 12 + colW + ansW, y + 12);
    y += rowH;
  }

  // --- responses ---
  const perPage = Math.max(1, Math.floor((PAGE_H - MARGIN * 2 - 60) / 40));
  for (let s = 0; s < submissions.length; s++) {
    const sub = submissions[s];
    ensureSpace(90);
    if (s > 0 && s % perPage === 0) {
      ensureSpace(120);
    }
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20, 90, 180);
    doc.text(`#${s + 1} — ${new Date(sub.submittedAt).toLocaleString()}`, MARGIN, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (sub.durationMs) {
      doc.setTextColor(110, 110, 110);
      doc.text(`Duration: ${formatDuration(sub.durationMs)}`, MARGIN, y + 12);
      y += 6;
    }
    y += 12;
    doc.setTextColor(50, 50, 50);
    for (const col of columns) {
      const text = formatValueForExport(sub.values[col.fieldId]).text;
      if (!text) continue;
      const label = wrap(doc, col.label, 150);
      doc.text(label, MARGIN, y);
      const lines = wrap(doc, text, CONTENT_W - 170);
      for (const line of lines) {
        ensureSpace(14);
        doc.text(line, MARGIN + 162, y);
        y += 12;
      }
      y += 2;
    }
  }

  const buffer = doc.output('arraybuffer');
  return new Blob([buffer], { type: 'application/pdf' });
}

function countQuestions(form: FormDefinition): number {
  let n = 0;
  const walk = (els: FormDefinition['pages'][number]['elements']): void => {
    for (const el of els) {
      if (el.type === 'group') walk(el.elements);
      else if (el.type !== 'section') n += 1;
    }
  };
  form.pages.forEach((p) => walk(p.elements));
  return n;
}

/**
 * Render a single-submission receipt: form header, submitted-at, and one
 * "question → answer" line per answered field. Used on the runner's
 * thank-you screen after submitting.
 */
export async function submissionToPdf(form: FormDefinition, submission: Submission): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = MARGIN;

  const ensureSpace = (needed = 60): void => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text(form.name, MARGIN, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  if (submission.durationMs) {
    doc.text(
      `Submitted ${new Date(submission.submittedAt).toLocaleString()} · Duration: ${formatDuration(submission.durationMs)}`,
      MARGIN,
      y,
    );
  } else {
    doc.text(`Submitted ${new Date(submission.submittedAt).toLocaleString()}`, MARGIN, y);
  }
  y += 22;

  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text(drawWord(doc, 'Your answers'), MARGIN, y + 12);
  y += 22;

  const rows = receiptRows(form, submission);
  doc.setFontSize(10);
  if (rows.length === 0) {
    doc.setTextColor(110, 110, 110);
    doc.text('No answers.', MARGIN, y);
    y += 14;
  }
  for (const row of rows) {
    ensureSpace(30);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 60);
    const labelLines = wrap(doc, row.label, 170);
    for (const line of labelLines) {
      ensureSpace(14);
      doc.text(line, MARGIN, y);
      y += 12;
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const valueLines = wrap(doc, row.value, CONTENT_W - 190);
    for (const line of valueLines) {
      ensureSpace(14);
      doc.text(line, MARGIN + 180, y);
      y += 12;
    }
    y += 8;
  }

  const buffer = doc.output('arraybuffer');
  return new Blob([buffer], { type: 'application/pdf' });
}

function receiptRows(
  form: FormDefinition,
  submission: Submission,
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const walk = (elements: Elements, path: string[]): void => {
    for (const el of elements) {
      if (el.type === 'group') {
        walk((el as { elements: Elements }).elements, [...path, el.label]);
        continue;
      }
      if (el.type === 'section') continue;
      const text = formatValueForExport(submission.values[el.id]).text;
      if (!text) continue;
      rows.push({ label: [...path, el.label].join(' / '), value: text });
    }
  };
  form.pages.forEach((p) => walk(p.elements, []));
  return rows;
}

function wrap(doc: jsPDF, text: string, width: number): string[] {
  return doc.splitTextToSize(text, width) as string[];
}

function drawWord(doc: jsPDF, text: string): string {
  return doc.splitTextToSize(text, CONTENT_W - 24)[0] as string;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
