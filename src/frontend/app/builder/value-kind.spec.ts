import type { ElementDefinition, ScaleElement } from '@shared/model/form.model';
import { describe, expect, it } from 'vitest';
import { fitsKind, parseRaw, rawText, scaleSteps, valueKindOf } from './value-kind';

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

describe('scaleSteps', () => {
  it('lists every step from min to max', () => {
    expect(scaleSteps(scale)).toEqual([1, 1.5, 2]);
  });

  it('is empty for a step that would never end', () => {
    expect(scaleSteps({ ...scale, step: 0 })).toEqual([]);
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
});

describe('rawText', () => {
  it('shows any stored value as text', () => {
    expect(rawText(null)).toBe('');
    expect(rawText(3)).toBe('3');
    expect(rawText(['a', 'b'])).toBe('["a","b"]');
  });
});
