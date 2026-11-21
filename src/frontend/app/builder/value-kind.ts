import type { ElementDefinition, ScaleElement } from '@shared/model/form.model';
import type { FieldValue } from '@shared/model/values.model';

/** The control the builder uses to enter a fixed value of a question. */
export type ValueKind =
  | 'text'
  | 'number'
  | 'scale'
  | 'boolean'
  | 'date'
  | 'time'
  | 'dateTime'
  | 'options'
  | 'unsupported';

/** Control for literal values of `el`; anything without a typed value (groups, pages) is text. */
export function valueKindOf(el: ElementDefinition | null | undefined): ValueKind {
  switch (el?.type) {
    case 'number':
      return 'number';
    case 'scale':
      return 'scale';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'time':
      return 'time';
    case 'dateTime':
      return 'dateTime';
    case 'choice':
    case 'dropdown':
    case 'multiChoice':
      return 'options';
    case 'file':
    case 'signature':
      return 'unsupported';
    default:
      return 'text';
  }
}

/** The values a scale question offers, rounded like the runner shows them. */
export function scaleSteps(el: ScaleElement): number[] {
  const out: number[] = [];
  if (!(el.step > 0)) return out;
  for (let v = el.min; v <= el.max + 1e-9; v += el.step) out.push(Math.round(v * 100) / 100);
  return out;
}

const NUMERIC = /^-?\d*\.?\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * Whether the typed control of `kind` can show `value` as it is stored. A value that does not
 * fit is shown as raw text instead, so it is never dropped or rewritten without an edit.
 */
export function fitsKind(
  kind: ValueKind,
  value: unknown,
  el?: ElementDefinition | null,
  multiple = false,
): boolean {
  if (value === null || value === undefined || value === '') return true;
  switch (kind) {
    case 'text':
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    case 'number':
      return (
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && NUMERIC.test(value.trim()))
      );
    case 'scale': {
      const n = typeof value === 'string' && NUMERIC.test(value.trim()) ? Number(value) : value;
      return el?.type === 'scale' && typeof n === 'number' && scaleSteps(el).includes(n);
    }
    case 'boolean':
      return typeof value === 'boolean' || value === 'true' || value === 'false';
    case 'date':
      return typeof value === 'string' && DATE.test(value);
    case 'time':
      return typeof value === 'string' && TIME.test(value);
    case 'dateTime':
      return typeof value === 'string' && DATE_TIME.test(value);
    case 'options':
      // Unknown ids still fit: the option picker lists them as removed options.
      return multiple
        ? Array.isArray(value) && value.every((v) => typeof v === 'string')
        : typeof value === 'string';
    case 'unsupported':
      return false;
  }
}

/**
 * Parses text typed into the raw fallback field. Numbers and booleans are only converted where
 * the question holds them; everything else stays the text that was typed.
 */
export function parseRaw(kind: ValueKind, raw: string): FieldValue {
  const s = raw.trim();
  if (s === '') return null;
  if ((kind === 'number' || kind === 'scale') && NUMERIC.test(s)) return Number(s);
  if (kind === 'boolean' && (s === 'true' || s === 'false')) return s === 'true';
  return raw;
}

/** Text shown for a stored value in the raw fallback field. */
export function rawText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
