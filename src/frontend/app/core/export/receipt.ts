import { childrenOf, type ElementParent } from '@shared/model/form-tree';
import type { FormDefinition } from '@shared/model/form.model';
import type { Submission } from '@shared/model/submission.model';
import { formatValueForExport } from './columns';

export type ReceiptBlock =
  | { kind: 'page'; label: string; indent: number }
  | { kind: 'group'; label: string; indent: number }
  | { kind: 'answer'; label: string; value: string; indent: number };

/**
 * Flatten a form into the blocks shown on a submission receipt, in order:
 * page headings (only when the page holds at least one answer), group
 * headings (only when the group holds at least one answer) followed by their
 * answered questions, indented by nesting depth. Sections are treated as
 * visual dividers and skipped; unanswered questions are omitted.
 */
export function buildReceipt(form: FormDefinition, submission: Submission): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [];
  const walk = (parent: ElementParent, indent: number): boolean => {
    let hasAnswers = false;
    for (const el of childrenOf(form, parent)) {
      if (el.type === 'group') {
        const start = blocks.length;
        const descended = walk(el, indent + 1);
        if (descended) {
          blocks.splice(start, 0, { kind: 'group', label: el.label, indent });
          hasAnswers = true;
        }
      } else if (el.type === 'section') {
        continue;
      } else {
        const text = formatValueForExport(submission.values[el.id], el).text;
        if (!text) continue;
        blocks.push({ kind: 'answer', label: el.label, value: text, indent });
        hasAnswers = true;
      }
    }
    return hasAnswers;
  };
  form.pages.forEach((page, index) => {
    const start = blocks.length;
    const hasAnswers = walk(page, 0);
    if (hasAnswers) {
      blocks.splice(start, 0, {
        kind: 'page',
        label: page.title?.trim() || `Page ${index + 1}`,
        indent: 0,
      });
    }
  });
  return blocks;
}
