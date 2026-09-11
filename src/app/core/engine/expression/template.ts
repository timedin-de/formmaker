import type { FieldValue } from '../../model/values.model';

export const TEMPLATE_PATTERN =
  /\{\{\s*([A-Za-z][A-Za-z0-9_.-]*)\s*(?:\|\s*([A-Za-z]+)(?:\s*:\s*([^}]*))?)?\s*\}\}/g;

export type TemplateFilter = (value: FieldValue, arg: string | undefined) => string;

function formatValue(value: FieldValue): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if ('dataUrl' in value) return '[signature]';
    return '[file]';
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const FILTERS: Record<string, TemplateFilter> = {
  upper: (v) => formatValue(v).toUpperCase(),
  lower: (v) => formatValue(v).toLowerCase(),
  trim: (v) => formatValue(v).trim(),
  title: (v) =>
    formatValue(v).replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),
  number: (v, arg) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return formatValue(v);
    const digits = arg !== undefined ? Math.max(0, parseInt(arg, 10) || 0) : 2;
    return n.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  },
  currency: (v, arg) => {
    const n = typeof v === 'number' ? v : Number(v);
    const currency = (arg || 'USD').toUpperCase();
    if (!Number.isFinite(n)) return `${n.toFixed(2)} ${currency}`;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  },
  date: (v) => {
    if (!v) return '';
    const d = new Date(typeof v === 'number' ? v : String(v));
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },
};

export interface TemplateSegment {
  kind: 'text' | 'ref';
  value: string;
  filter?: string;
  arg?: string;
}

export function parseTemplate(template: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let last = 0;
  TEMPLATE_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TEMPLATE_PATTERN.exec(template))) {
    const index = m.index;
    if (index > last) segments.push({ kind: 'text', value: template.slice(last, index) });
    segments.push({ kind: 'ref', value: m[1], filter: m[2], arg: m[3] });
    last = index + m[0].length;
  }
  if (last < template.length) segments.push({ kind: 'text', value: template.slice(last) });
  return segments;
}

/** Substitute {{fieldId}} and {{fieldId | filter}} references against a values map. */
export function interpolateTemplate(
  template: string,
  values: Readonly<Record<string, FieldValue>>,
  filters: Record<string, TemplateFilter> = FILTERS,
): string {
  if (!template.includes('{{')) return template;
  return parseTemplate(template)
    .map((seg) => {
      if (seg.kind === 'text') return seg.value;
      const value = values[seg.value] ?? null;
      if (seg.filter && filters[seg.filter])
        return filters[seg.filter](value as FieldValue, seg.arg);
      return formatValue(value as FieldValue);
    })
    .join('');
}

/** Field ids referenced by a piped template. */
export function templateReferences(template: string): string[] {
  const refs = new Set<string>();
  TEMPLATE_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TEMPLATE_PATTERN.exec(template))) refs.add(m[1]);
  return [...refs];
}

/** True when text contains pipes (`{{...}}`). */
export function isPiped(template: string | undefined): boolean {
  return template !== undefined && template.includes('{{');
}
