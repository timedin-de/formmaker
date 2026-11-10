import { documentFromTree, type ElementNode } from '@test/helper/forms';
import { describe, expect, it } from 'vitest';
import {
  type ConditionGroup,
  FORM_SCHEMA_VERSION,
  type FormDefinition,
  type TextElement,
} from '../model';
import { submissionIssue } from './submission-validator';

function text(id: string, extra: Partial<TextElement> = {}): TextElement {
  return {
    id,
    type: 'text',
    label: id,
    description: undefined,
    width: 1,
    required: false,
    validations: [],
    readonly: false,
    defaultValue: null,
    placeholder: '',
    ...extra,
  };
}

function filled(fieldId: string): ConditionGroup {
  return { logic: 'all', conditions: [{ fieldId, operator: 'isNotEmpty' }], groups: [] };
}

function formOf(elements: ElementNode[], pageWhen?: ConditionGroup): FormDefinition {
  return {
    id: 'f1',
    version: 1,
    schemaVersion: FORM_SCHEMA_VERSION,
    settings: { navigation: 'auto' },
    ...documentFromTree([{ id: 'p1', title: 'P', subtitle: '', elements, enabledWhen: pageWhen }]),
    createdAt: '',
    updatedAt: '',
  };
}

const opaque = new Set(['secret']);

describe('submissionIssue with encrypted answers', () => {
  it('rejects an encrypted answer sent in plain text', () => {
    const form = formOf([text('secret')]);
    expect(submissionIssue(form, { secret: 'x' }, opaque)).toContain('encrypted element: secret');
  });

  it('skips required checks of encrypted questions', () => {
    const form = formOf([text('secret', { required: true })]);
    expect(submissionIssue(form, {}, opaque)).toBeNull();
  });

  it('accepts a missing answer whose condition reads an encrypted one', () => {
    const form = formOf([
      text('secret'),
      text('next', { required: true, enabledWhen: filled('secret') }),
    ]);
    expect(submissionIssue(form, {}, opaque)).toBeNull();
  });

  it('still validates such an answer when it is given', () => {
    const form = formOf([
      text('secret'),
      text('next', {
        enabledWhen: filled('secret'),
        validations: [{ id: 'v', rule: 'maxLength', value: 2, message: 'too long' }],
      }),
    ]);
    expect(submissionIssue(form, { next: 'ok' }, opaque)).toBeNull();
    expect(submissionIssue(form, { next: 'way too long' }, opaque)).toContain('too long');
  });

  it('keeps a known hidden parent hidden', () => {
    const form = formOf(
      [text('secret'), text('plain'), text('next', { enabledWhen: filled('secret') })],
      filled('plain'),
    );
    // The page is hidden because `plain` is empty, so `next` must not have a value.
    expect(submissionIssue(form, { next: 'x' }, opaque)).toContain('invisible element: next');
  });

  it('skips custom rules that read an encrypted answer', () => {
    const form = formOf([
      text('secret'),
      text('check', {
        required: true,
        validations: [{ id: 'v', rule: 'custom', expression: 'secret == "x"', message: 'no' }],
      }),
    ]);
    expect(submissionIssue(form, { check: 'y' }, opaque)).toBeNull();
    expect(submissionIssue(form, {}, opaque)).toContain('value for field check is invalid');
  });

  it('behaves as before without encrypted answers', () => {
    const form = formOf([text('a', { required: true })]);
    expect(submissionIssue(form, {})).toContain('value for field a is invalid');
    expect(submissionIssue(form, { a: 'x', b: 'y' })).toContain('non-existent element: b');
    expect(submissionIssue(form, { a: 'x' })).toBeNull();
  });
});
