import { describe, expect, it } from 'vitest';
import { ValidationsByQuestionType } from './validation.model';

describe('ValidationsByQuestionType', () => {
  it('offers required and custom for every question type, without duplicates', () => {
    for (const [type, rules] of Object.entries(ValidationsByQuestionType)) {
      expect(rules, type).toContain('required');
      expect(rules, type).toContain('custom');
      expect(new Set(rules).size, type).toBe(rules.length);
    }
  });

  it('keeps the number limits the legacy-limits migration creates', () => {
    expect(ValidationsByQuestionType.number).toEqual(expect.arrayContaining(['min', 'max']));
    expect(ValidationsByQuestionType.text).toContain('maxLength');
    expect(ValidationsByQuestionType.longText).toContain('maxLength');
  });
});
