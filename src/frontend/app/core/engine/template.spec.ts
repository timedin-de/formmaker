import { describe, expect, it } from 'vitest';
import {
  interpolateTemplate,
  templateReferences,
  isPiped,
  parseTemplate,
} from './expression/template';
import type { FieldValue } from '@shared/model/values.model';

const values: Record<string, FieldValue> = {
  first_name: 'Alice',
  amount: 49.99,
  discount: 0.1,
};

describe('interpolateTemplate', () => {
  it('returns plain text unchanged', () => {
    expect(interpolateTemplate('Hello world', values)).toBe('Hello world');
  });

  it('substitutes fields', () => {
    expect(interpolateTemplate('Hello {{first_name}}!', values)).toBe('Hello Alice!');
  });

  it('applies filters', () => {
    expect(interpolateTemplate('{{first_name | upper}}', values)).toBe('ALICE');
    expect(interpolateTemplate('{{first_name | lower}}', values)).toBe('alice');
    expect(interpolateTemplate('{{amount | number:1}}', values)).toBe('50.0');
  });

  it('handles multiple interpolations', () => {
    expect(interpolateTemplate('{{first_name}} paid {{amount}}', values)).toBe('Alice paid 49.99');
  });

  it('renders null/missing as empty string', () => {
    expect(interpolateTemplate('Hello {{unknown}}', values)).toBe('Hello ');
  });

  it('handles boolean with title filter', () => {
    const v: Record<string, FieldValue> = { q_ok: true };
    expect(interpolateTemplate('{{q_ok | title}}', v)).toBe('Yes');
  });
});

describe('templateReferences', () => {
  it('collects referenced field ids', () => {
    expect(templateReferences('{{a}} and {{b | upper}} and {{c}}').sort()).toEqual(['a', 'b', 'c']);
  });
  it('returns empty when no pipes', () => {
    expect(templateReferences('hello world')).toEqual([]);
  });
});

describe('isPiped', () => {
  it('detects pipes', () => {
    expect(isPiped('{{x}}')).toBe(true);
    expect(isPiped('hello')).toBe(false);
    expect(isPiped(undefined)).toBe(false);
  });
});

describe('parseTemplate', () => {
  it('parses segments', () => {
    expect(parseTemplate('Hello {{name}}!')).toEqual([
      { kind: 'text', value: 'Hello ' },
      { kind: 'ref', value: 'name' },
      { kind: 'text', value: '!' },
    ]);
  });
});
