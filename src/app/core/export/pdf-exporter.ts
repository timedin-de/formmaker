import { jsPDF } from 'jspdf';
import { buildColumnBlocks, formatValueForExport } from './columns';
import { buildReceipt, type ReceiptBlock } from './receipt';
import type { FormDefinition } from '@shared/model/form.model';
import type { Submission } from '@shared/model/submission.model';

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
  const columnBlocks = buildColumnBlocks(form);
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

  let fieldIndex = 0;
  for (const block of columnBlocks) {
    ensureSpace(rowH * 2);
    if (block.kind === 'page') {
      doc.setFillColor(241, 243, 245);
      doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      doc.text(wrap(doc, block.label, CONTENT_W - 24), MARGIN + 12, y + 12);
      y += rowH;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      continue;
    }
    if (block.kind === 'group') {
      doc.setFillColor(228, 234, 242);
      doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(20, 90, 180);
      doc.text(wrap(doc, block.label, colW - 24), MARGIN + 12, y + 12);
      y += rowH;
      doc.setFont('helvetica', 'normal');
      continue;
    }
    const col = block.column;
    if (fieldIndex % 2 === 1) doc.setFillColor(248, 249, 250);
    else doc.setFillColor(255, 255, 255);
    fieldIndex += 1;
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
    const state: { value: number } = { value: y };
    renderBlocks(doc, buildReceipt(form, sub), ensureSpace, state, {
      fontSize: 9,
      groupSize: 10,
      labelWrap: 150,
      valueX: MARGIN + 162,
      gapAfter: 2,
    });
    y = state.value;
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
 * "question → answer" line per answered field, grouped under their group
 * headings when present. Used on the runner's thank-you screen.
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

  const blocks = buildReceipt(form, submission);
  doc.setFontSize(10);
  if (blocks.length === 0) {
    doc.setTextColor(110, 110, 110);
    doc.text('No answers.', MARGIN, y);
    y += 14;
  }
  const state: { value: number } = { value: y };
  renderBlocks(doc, blocks, ensureSpace, state, {
    fontSize: 10,
    groupSize: 12,
    labelWrap: 170,
    valueX: MARGIN + 180,
    gapAfter: 8,
  });
  y = state.value;

  const buffer = doc.output('arraybuffer');
  return new Blob([buffer], { type: 'application/pdf' });
}

/**
 * Render receipt blocks (page / group / answer) for one submission.
 * Pages are rendered as bold subheadings with a divider line; groups in
 * blue bold; answers as "label → value" pairs indented by nesting depth.
 */
interface BlockRenderOptions {
  fontSize: number;
  groupSize: number;
  labelWrap: number;
  valueX: number;
  gapAfter?: number;
}

function renderBlocks(
  doc: jsPDF,
  blocks: ReceiptBlock[],
  ensureSpace: (needed?: number) => void,
  state: { value: number },
  opts: BlockRenderOptions,
): void {
  const lineHeight = 12;
  for (const block of blocks) {
    ensureSpace(block.kind === 'answer' ? 30 : 40);
    const x = MARGIN + block.indent * 18;
    if (block.kind === 'page') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(50, 50, 50);
      const lines = wrap(doc, block.label, CONTENT_W - x);
      for (const line of lines) {
        ensureSpace(14);
        doc.text(line, x, state.value);
        state.value += 15;
      }
      doc.setDrawColor(210, 215, 220);
      doc.setLineWidth(0.6);
      doc.line(MARGIN, state.value - 7, MARGIN + CONTENT_W, state.value - 7);
      state.value += 8;
      doc.setFontSize(opts.fontSize);
      continue;
    }
    if (block.kind === 'group') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(opts.groupSize);
      doc.setTextColor(20, 90, 180);
      const lines = wrap(doc, block.label, CONTENT_W - x);
      for (const line of lines) {
        ensureSpace(14);
        doc.text(line, x, state.value);
        state.value += 15;
      }
      state.value += 6;
      doc.setFontSize(opts.fontSize);
      continue;
    }
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 60);
    const labelLines = wrap(doc, block.label, opts.labelWrap - block.indent * 18);
    for (const line of labelLines) {
      ensureSpace(14);
      doc.text(line, x, state.value);
      state.value += lineHeight;
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const valueWrap = CONTENT_W - (opts.valueX - MARGIN) - 12;
    const valueLines = wrap(doc, block.value, valueWrap);
    for (const line of valueLines) {
      ensureSpace(14);
      doc.text(line, opts.valueX, state.value);
      state.value += lineHeight;
    }
    state.value += opts.gapAfter ?? 8;
  }
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
