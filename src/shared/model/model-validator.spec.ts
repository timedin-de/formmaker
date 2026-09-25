import { parseFormData } from '@shared/schemas';
import { describe, expect, it } from 'vitest';
import type { ElementDefinition, FormDefinition } from './form.model';
import { DEFAULT_TIME_INTERVAL } from './form.model';

const formJson = (element: Record<string, unknown>): string =>
  JSON.stringify({
    id: 'f1',
    name: 'Form',
    version: 1,
    schemaVersion: 1,
    settings: { navigation: 'auto' },
    pages: [{ id: 'p1', elements: [element] }],
  });

const parse = (element: Record<string, unknown>) => {
  const { data, error } = parseFormData(formJson(element));
  return { form: data as FormDefinition, error };
};

const timeElement = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'q1',
  type: 'time',
  label: 'Start',
  ...overrides,
});

const firstElement = (form: FormDefinition | null): ElementDefinition | undefined =>
  form?.pages[0]?.elements[0];

describe('time element schema', () => {
  it('applies the default interval to legacy elements without one', () => {
    const { form, error } = parse(timeElement());
    expect(error).toBeNull();
    const el = firstElement(form) as { timeInterval?: { value: number } };
    expect(el.timeInterval).toEqual(DEFAULT_TIME_INTERVAL);
  });

  it('keeps a persisted interval', () => {
    const { form, error } = parse(timeElement({ timeInterval: { value: 15, multiplier: '60' } }));
    expect(error).toBeNull();
    const el = firstElement(form) as { timeInterval?: { value: number } };
    expect(el.timeInterval).toEqual({ value: 15, multiplier: '60' });
  });

  it('rejects out-of-range values and unknown units', () => {
    expect(
      parse(timeElement({ timeInterval: { value: 0, multiplier: '60' } })).error,
    ).not.toBeNull();
    expect(
      parse(timeElement({ timeInterval: { value: 1, multiplier: '120' } })).error,
    ).not.toBeNull();
    expect(
      parse(timeElement({ timeInterval: { value: 1.5, multiplier: '60' } })).error,
    ).not.toBeNull();
  });

  it('covers the dateTime type as well', () => {
    const { form, error } = parse({ ...timeElement(), type: 'dateTime' });
    expect(error).toBeNull();
    expect(firstElement(form)?.type).toBe('dateTime');
  });

  it('leaves the date type untouched', () => {
    const { form, error } = parse({ ...timeElement(), type: 'date' });
    expect(error).toBeNull();
    expect(firstElement(form)).not.toHaveProperty('timeInterval');
  });
});
