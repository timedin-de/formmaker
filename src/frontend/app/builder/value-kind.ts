import { type ElementDefinition, scaleValues } from '@shared/model/form.model';
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

const NUMERIC = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** `HH:mm`, optionally with seconds and up to three fractional digits, as native inputs take. */
const TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/;

/** The number a typed numeric string stands for; `undefined` when it is no finite number. */
function numericValue(s: string): number | undefined {
  const t = s.trim();
  if (!NUMERIC.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** A real calendar day, e.g. not `2026-02-30`: native date inputs show invalid days as empty. */
function isDate(s: string): boolean {
  const m = DATE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** A real clock time, e.g. not `25:00`. */
function isTime(s: string): boolean {
  const m = TIME.exec(s);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60 && Number(m[3] ?? 0) < 60;
}

/** A local date-time; native inputs accept a space as well as `T` between date and time. */
function isDateTime(s: string): boolean {
  const t = s.search(/[T ]/);
  return t > 0 && isDate(s.slice(0, t)) && isTime(s.slice(t + 1));
}

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
        (typeof value === 'string' && numericValue(value) !== undefined)
      );
    case 'scale': {
      const n = typeof value === 'string' ? numericValue(value) : value;
      return el?.type === 'scale' && typeof n === 'number' && !!scaleValues(el)?.includes(n);
    }
    case 'boolean':
      return typeof value === 'boolean' || value === 'true' || value === 'false';
    case 'date':
      return typeof value === 'string' && isDate(value);
    case 'time':
      return typeof value === 'string' && isTime(value);
    case 'dateTime':
      return typeof value === 'string' && isDateTime(value);
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
  const n = kind === 'number' || kind === 'scale' ? numericValue(s) : undefined;
  if (n !== undefined) return n;
  if (kind === 'boolean' && (s === 'true' || s === 'false')) return s === 'true';
  return raw;
}

/** Text shown for a stored value in the raw fallback field. */
export function rawText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
