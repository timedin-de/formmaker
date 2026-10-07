import type { QuestionDefinition } from '@shared/model/form.model';
import { describe, expect, it } from 'vitest';
import { validateElementValue } from './validators';

const textEl = (overrides: Partial<Record<string, unknown>> = {}): QuestionDefinition =>
  ({ id: 'q1', type: 'text', label: 'Name', ...overrides }) as QuestionDefinition;

describe('validateElementValue', () => {
  it('passes for empty optional field', () => {
    const r = validateElementValue(textEl(), '', {});
    expect(r.valid).toBe(true);
  });

  it('flags required empty', () => {
    const r = validateElementValue(textEl({ required: true }), '', {});
    expect(r.valid).toBe(false);
    expect(r.failures[0].message).toContain('required');
  });

  it('passes required non-empty', () => {
    expect(validateElementValue(textEl({ required: true }), 'Bob', {}).valid).toBe(true);
  });

  it('min/max length', () => {
    const el = textEl({ validations: [{ id: 'a', rule: 'minLength', value: 3 }] });
    expect(validateElementValue(el, 'ab', {}).valid).toBe(false);
    expect(validateElementValue(el, 'abc', {}).valid).toBe(true);
  });

  it('email rule', () => {
    const el = textEl({ validations: [{ id: 'a', rule: 'email' }] });
    expect(validateElementValue(el, 'not-an-email', {}).valid).toBe(false);
    expect(validateElementValue(el, 'a@b.co', {}).valid).toBe(true);
  });

  it('pattern rule', () => {
    const el = textEl({ validations: [{ id: 'a', rule: 'pattern', pattern: '^[A-Z]{2}\\d{3}$' }] });
    expect(validateElementValue(el, 'AB123', {}).valid).toBe(true);
    expect(validateElementValue(el, 'ab123', {}).valid).toBe(false);
  });

  it('number min/max', () => {
    const el = textEl({
      type: 'number',
      validations: [
        { id: 'a', rule: 'min', value: 10 },
        { id: 'b', rule: 'max', value: 20 },
      ],
    });
    expect(validateElementValue(el, 5, {}).valid).toBe(false);
    expect(validateElementValue(el, 15, {}).valid).toBe(true);
    expect(validateElementValue(el, 25, {}).valid).toBe(false);
  });

  it('custom expression referencing another field', () => {
    const el = textEl({
      validations: [{ id: 'a', rule: 'custom', expression: 'required(q1) && q1 == q_confirm' }],
    });
    const values = { q1: 'secret', q_confirm: 'secret' };
    expect(validateElementValue(el, 'secret', values).valid).toBe(true);
    expect(validateElementValue(el, 'secret', { ...values, q_confirm: 'nope' }).valid).toBe(false);
  });

  it('custom expression can return a message string', () => {
    const el = textEl({
      validations: [{ id: 'a', rule: 'custom', expression: 'msg("Password too short")', value: 0 }],
    });
    const r = validateElementValue(el, 'x', {});
    expect(r.valid).toBe(false);
    expect(r.failures[0].message).toBe('Password too short');
  });

  it('file rules', () => {
    const el = textEl({
      type: 'file',
      validations: [
        { id: 'a', rule: 'minFiles', value: 2 },
        { id: 'b', rule: 'fileType', accept: '.pdf' },
      ],
    });
    const onePdf = [{ name: 'a.pdf', size: 10, mimeType: 'application/pdf' }];
    const twoPdf = [...onePdf, { name: 'b.pdf', size: 20, mimeType: 'application/pdf' }];
    expect(validateElementValue(el, onePdf, {}).valid).toBe(false); // minFiles
    expect(validateElementValue(el, twoPdf, {}).valid).toBe(true);
  });

  it('pipes a custom message', () => {
    const el = textEl({
      required: true,
      validations: [
        { id: 'a', rule: 'required', message: 'Hello {{q_name}}, please fill {{q_field_label}}' },
      ],
    });
    const r = validateElementValue(el, '', { q_name: 'Ada', q_field_label: 'the box' });
    expect(r.failures[0].message).toBe('Hello Ada, please fill the box');
  });

  const withRule = (rule: Record<string, unknown>, overrides = {}) =>
    textEl({ validations: [{ id: 'r', ...rule }], ...overrides });
  const ok = (el: QuestionDefinition, v: unknown) => validateElementValue(el, v as never, {}).valid;

  it('maxLength on strings and arrays', () => {
    const el = withRule({ rule: 'maxLength', value: 3 });
    expect(ok(el, 'abcd')).toBe(false);
    expect(ok(el, 'abc')).toBe(true);
    expect(ok(el, 5)).toBe(true); // no length -> skipped
  });

  it('between is inclusive and skips non-numeric values', () => {
    const el = withRule({ rule: 'between', value: 1, valueTo: 5 });
    expect(ok(el, 0)).toBe(false);
    expect(ok(el, 1)).toBe(true);
    expect(ok(el, 5)).toBe(true);
    expect(ok(el, '6')).toBe(false);
    expect(ok(el, 'abc')).toBe(true);
  });

  it('url and phone rules', () => {
    const url = withRule({ rule: 'url' });
    expect(ok(url, 'https://example.com/a')).toBe(true);
    expect(ok(url, 'example.com')).toBe(true);
    expect(ok(url, 'not a url')).toBe(false);
    expect(ok(url, '')).toBe(true);

    const phone = withRule({ rule: 'phone' });
    expect(ok(phone, '+49 (30) 123-4567')).toBe(true);
    expect(ok(phone, '12')).toBe(false);
    expect(ok(phone, 'call me maybe')).toBe(false);
  });

  it('integer and number rules', () => {
    const int = withRule({ rule: 'integer' });
    expect(ok(int, 3)).toBe(true);
    expect(ok(int, '3.5')).toBe(false);

    const num = withRule({ rule: 'number' });
    expect(ok(num, '12')).toBe(true);
    expect(ok(num, 'twelve')).toBe(false);
    expect(ok(num, '')).toBe(true);
  });

  it('dateMin and dateMax', () => {
    const min = withRule({ rule: 'dateMin', value: '2026-01-10' });
    expect(ok(min, '2026-01-09')).toBe(false);
    expect(ok(min, '2026-01-10')).toBe(true);
    expect(ok(min, 'garbage')).toBe(true);
    expect(validateElementValue(min, '2026-01-01', {}).failures[0].message).toContain('2026-01-10');

    const max = withRule({ rule: 'dateMax', value: '2026-01-10' });
    expect(ok(max, '2026-01-11')).toBe(false);
    expect(ok(max, '2026-01-10')).toBe(true);
  });

  it('maxFiles, fileSizeMaxMb and fileType by mime type', () => {
    const file = (name: string, size: number, mimeType = 'text/plain') => ({
      name,
      size,
      mimeType,
    });
    expect(ok(withRule({ rule: 'maxFiles', value: 1 }), [file('a', 1), file('b', 1)])).toBe(false);
    expect(ok(withRule({ rule: 'maxFiles', value: 2 }), [file('a', 1), file('b', 1)])).toBe(true);

    const size = withRule({ rule: 'fileSizeMaxMb', value: 1 });
    expect(ok(size, [file('a', 2 * 1024 * 1024)])).toBe(false);
    expect(ok(size, [file('a', 1024)])).toBe(true);

    const type = withRule({ rule: 'fileType', accept: 'image/png, .PDF' });
    expect(ok(type, [file('a.txt', 1, 'image/png')])).toBe(true);
    expect(ok(type, [file('A.pdf', 1)])).toBe(true);
    expect(ok(type, [file('a.txt', 1)])).toBe(false);
    expect(ok(withRule({ rule: 'fileType', accept: '' }), [file('a.txt', 1)])).toBe(true);
  });

  it('ignores invalid patterns and unknown rules', () => {
    expect(ok(withRule({ rule: 'pattern', pattern: '(' }), 'x')).toBe(true);
    expect(ok(withRule({ rule: 'bogus' }), 'x')).toBe(true);
  });

  it('rejects values that are not a configured option', () => {
    const options = [
      { id: 'o1', label: 'A', value: 'a' },
      { id: 'o2', label: 'B', value: 'b' },
    ];
    const single = textEl({ type: 'choice', options });
    expect(ok(single, 'a')).toBe(true);
    expect(ok(single, 'z')).toBe(false);
    expect(ok(single, ['a'])).toBe(false); // wrong arity
    expect(ok(single, '')).toBe(true); // empty is the required rule's job

    const multi = textEl({ type: 'multiChoice', options });
    expect(ok(multi, ['a', 'b'])).toBe(true);
    expect(ok(multi, ['a', 'z'])).toBe(false);
    expect(ok(multi, 'a')).toBe(false);
  });

  it('does not add a second required rule when one is configured', () => {
    const el = textEl({ required: true, validations: [{ id: 'r', rule: 'required' }] });
    expect(validateElementValue(el, '', {}).failures).toHaveLength(1);
  });

  it('custom expression yields a default message for false results', () => {
    const el = withRule({ rule: 'custom', expression: 'false' });
    const r = validateElementValue(el, 'x', {});
    expect(r.valid).toBe(false);
    expect(r.failures[0].type).toBe('custom');
  });
});
