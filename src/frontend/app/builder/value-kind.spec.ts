import type { ElementDefinition, ScaleElement } from '@shared/model/form.model';
import { describe, expect, it } from 'vitest';
import { fitsKind, parseRaw, rawText, valueKindOf } from './value-kind';

const scale = { id: 's', type: 'scale', min: 1, max: 2, step: 0.5 } as ScaleElement;
const el = (type: string) => ({ id: 'x', type }) as ElementDefinition;

describe('valueKindOf', () => {
  it('picks the control from the question type', () => {
    expect(valueKindOf(el('number'))).toBe('number');
    expect(valueKindOf(scale)).toBe('scale');
    expect(valueKindOf(el('boolean'))).toBe('boolean');
    expect(valueKindOf(el('date'))).toBe('date');
    expect(valueKindOf(el('time'))).toBe('time');
    expect(valueKindOf(el('dateTime'))).toBe('dateTime');
    for (const t of ['choice', 'dropdown', 'multiChoice'])
      expect(valueKindOf(el(t))).toBe('options');
    expect(valueKindOf(el('file'))).toBe('unsupported');
    expect(valueKindOf(el('signature'))).toBe('unsupported');
  });

  it('falls back to text for text, groups and unknown fields', () => {
    expect(valueKindOf(el('text'))).toBe('text');
    expect(valueKindOf(el('longText'))).toBe('text');
    expect(valueKindOf(el('group'))).toBe('text');
    expect(valueKindOf(null)).toBe('text');
  });
});

describe('fitsKind', () => {
  it('accepts an empty value for every kind', () => {
    for (const value of [null, undefined, '']) expect(fitsKind('unsupported', value)).toBe(true);
  });

  it('checks values against their typed control', () => {
    expect(fitsKind('number', 4.5)).toBe(true);
    expect(fitsKind('number', '12')).toBe(true);
    expect(fitsKind('number', 'twelve')).toBe(false);
    expect(fitsKind('scale', 1.5, scale)).toBe(true);
    expect(fitsKind('scale', 3, scale)).toBe(false);
    expect(fitsKind('boolean', true)).toBe(true);
    expect(fitsKind('boolean', 'true')).toBe(true);
    expect(fitsKind('boolean', 'yes')).toBe(false);
    expect(fitsKind('date', '2026-11-21')).toBe(true);
    expect(fitsKind('date', 'today')).toBe(false);
    expect(fitsKind('time', '09:30')).toBe(true);
    expect(fitsKind('time', '9 am')).toBe(false);
    expect(fitsKind('dateTime', '2026-11-21T09:30')).toBe(true);
    expect(fitsKind('dateTime', '2026-11-21')).toBe(false);
    expect(fitsKind('text', 5)).toBe(true);
    expect(fitsKind('text', ['a'])).toBe(false);
    expect(fitsKind('unsupported', 'x')).toBe(false);
  });

  it('rejects days and times that native inputs would blank out', () => {
    expect(fitsKind('date', '2026-02-30')).toBe(false);
    expect(fitsKind('date', '2028-02-29')).toBe(true);
    expect(fitsKind('time', '25:00')).toBe(false);
    expect(fitsKind('time', '09:60')).toBe(false);
    expect(fitsKind('time', '23:59:59')).toBe(true);
    expect(fitsKind('dateTime', '2026-02-30T09:30')).toBe(false);
    expect(fitsKind('dateTime', '2026-11-21T24:00')).toBe(false);
  });

  it('rejects numbers too large to be finite', () => {
    expect(fitsKind('number', '9'.repeat(400))).toBe(false);
    expect(fitsKind('number', '1e400')).toBe(false);
    expect(fitsKind('scale', '9'.repeat(400), scale)).toBe(false);
  });

  it('accepts finite exponent notation', () => {
    expect(fitsKind('number', '1e3')).toBe(true);
    expect(fitsKind('number', '-2.5E-2')).toBe(true);
    expect(fitsKind('number', 'e3')).toBe(false);
  });

  it('accepts what native time inputs take: fractional seconds, a space before the time', () => {
    expect(fitsKind('time', '09:30:15.5')).toBe(true);
    expect(fitsKind('time', '09:30:15.123')).toBe(true);
    expect(fitsKind('time', '09:30:15.1234')).toBe(false);
    expect(fitsKind('dateTime', '2026-11-21T09:30:15.25')).toBe(true);
    expect(fitsKind('dateTime', '2026-11-21 09:30')).toBe(true);
  });

  it('expects a list of ids only for multiple options', () => {
    expect(fitsKind('options', 'id-a')).toBe(true);
    expect(fitsKind('options', ['id-a'])).toBe(false);
    expect(fitsKind('options', ['id-a'], null, true)).toBe(true);
    expect(fitsKind('options', 'id-a', null, true)).toBe(false);
  });
});

describe('parseRaw', () => {
  it('converts numbers and booleans only where the question holds them', () => {
    expect(parseRaw('number', ' 12 ')).toBe(12);
    expect(parseRaw('number', 'twelve')).toBe('twelve');
    expect(parseRaw('text', '12')).toBe('12');
    expect(parseRaw('boolean', 'false')).toBe(false);
    expect(parseRaw('date', 'tomorrow')).toBe('tomorrow');
    expect(parseRaw('date', '  ')).toBeNull();
  });

  it('keeps numbers too large to be finite as typed text', () => {
    const huge = '9'.repeat(400);
    expect(parseRaw('number', huge)).toBe(huge);
    expect(parseRaw('scale', huge)).toBe(huge);
    expect(parseRaw('number', '1e400')).toBe('1e400');
    expect(parseRaw('number', '1e3')).toBe(1000);
  });
});

describe('rawText', () => {
  it('shows any stored value as text', () => {
    expect(rawText(null)).toBe('');
    expect(rawText(3)).toBe('3');
    expect(rawText(['a', 'b'])).toBe('["a","b"]');
  });
});
