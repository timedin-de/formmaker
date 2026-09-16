import { describe, expect, it } from 'vitest';
import { validateElementValue } from './validators';
import type { QuestionDefinition } from '@shared/model/form.model';

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
});
