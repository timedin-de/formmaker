import type { ElementDefinition } from '@shared/model/form.model';
import type { FieldValue } from '@shared/model/values.model';
import { describe, expect, it } from 'vitest';
import {
  choiceValueFromLabels,
  interpolateTemplate,
  parseTemplate,
  templateReferences,
  templateValues,
} from './expression/template';

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

describe('templateValues', () => {
  const options = [
    { id: 'o1', label: 'Blue' },
    { id: 'o2', label: 'Green' },
  ];
  const elements = {
    q_color: { id: 'q_color', type: 'choice', label: 'Color', options },
    q_tags: { id: 'q_tags', type: 'multiChoice', label: 'Tags', options },
    q_name: { id: 'q_name', type: 'text', label: 'Name' },
  } as unknown as Record<string, ElementDefinition>;

  it('shows option labels instead of ids', () => {
    const v = templateValues({ q_color: 'o2', q_tags: ['o1', 'o2'], q_name: 'o1' }, elements);
    expect(interpolateTemplate('{{q_color | upper}} / {{q_tags}} / {{q_name}}', v)).toBe(
      'GREEN / Blue, Green / o1',
    );
  });

  it('maps labels back to the option ids of a choice element', () => {
    const color = elements['q_color'] as Parameters<typeof choiceValueFromLabels>[0];
    const tags = elements['q_tags'] as Parameters<typeof choiceValueFromLabels>[0];
    expect(choiceValueFromLabels(color, 'Green')).toBe('o2');
    expect(choiceValueFromLabels(color, ['Blue', 'Green'])).toBe('o1');
    expect(choiceValueFromLabels(color, 'Red')).toBeNull();
    expect(choiceValueFromLabels(tags, ['Green', 'Red', 'Blue'])).toEqual(['o2', 'o1']);
    expect(choiceValueFromLabels(tags, 'Blue')).toEqual(['o1']);
    expect(choiceValueFromLabels(tags, null)).toEqual([]);
  });

  it('renders removed options and empty answers as nothing', () => {
    const v = templateValues({ q_color: 'gone', q_tags: ['gone', 'o1'] }, elements);
    expect(interpolateTemplate('[{{q_color}}] [{{q_tags}}]', v)).toBe('[] [Blue]');
    expect(templateValues({ q_color: null }, elements)).toEqual({ q_color: null });
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

describe('parseTemplate', () => {
  it('parses segments', () => {
    expect(parseTemplate('Hello {{name}}!')).toEqual([
      { kind: 'text', value: 'Hello ' },
      { kind: 'ref', value: 'name' },
      { kind: 'text', value: '!' },
    ]);
  });
});
