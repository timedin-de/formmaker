import { BadRequestException, NotFoundException } from '@nestjs/common';
import type {
  ChoiceElement,
  ConditionGroup,
  ElementDefinition,
  FieldValue,
  FormDefinition,
  GroupElement,
  PageDefinition,
  TextElement,
} from '@shared/model';
import 'reflect-metadata';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRe2Regex } from '../common/re2-regex';
import type { Repository } from '../repository';
import { FormService } from './form.service';

function text(id: string, extra: Partial<TextElement> = {}): TextElement {
  return {
    id,
    type: 'text',
    label: id,
    description: undefined,
    width: 12,
    required: false,
    validations: [],
    readonly: false,
    defaultValue: null,
    placeholder: '',
    ...extra,
  };
}

function choice(id: string, extra: Partial<ChoiceElement> = {}): ChoiceElement {
  return {
    id,
    type: 'choice',
    label: id,
    description: undefined,
    width: 12,
    required: false,
    validations: [],
    readonly: false,
    defaultValue: null,
    options: [
      { id: 'o1', label: 'Yes', value: 'yes' },
      { id: 'o2', label: 'No', value: 'no' },
    ],
    ...extra,
  };
}

function group(id: string, elements: ElementDefinition[], enabledWhen?: ConditionGroup) {
  return {
    id,
    type: 'group',
    label: id,
    description: undefined,
    width: 12,
    defaultValue: null,
    collapsible: false,
    elements,
    enabledWhen,
  } satisfies GroupElement;
}

function page(
  id: string,
  elements: ElementDefinition[],
  enabledWhen?: ConditionGroup,
): PageDefinition {
  return { id, title: id, subtitle: '', elements, enabledWhen };
}

/** Visible when `fieldId` equals `value`. */
function when(fieldId: string, value: string): ConditionGroup {
  return {
    logic: 'all',
    conditions: [{ fieldId, operator: 'eq', operand: { kind: 'literal', value } }],
    groups: [],
  };
}

function isNotEmpty(fieldId: string): ConditionGroup {
  return { logic: 'all', conditions: [{ fieldId, operator: 'isNotEmpty' }], groups: [] };
}

function formOf(pages: PageDefinition[]): FormDefinition {
  return {
    id: 'form-1',
    name: 'Test form',
    version: 1,
    schemaVersion: 1,
    settings: { navigation: 'auto' },
    pages,
    createdAt: '',
    updatedAt: '',
  };
}

describe('FormService.addSubmission', () => {
  let form: FormDefinition | null;
  let addSubmission: ReturnType<typeof vi.fn>;
  let service: FormService;

  beforeEach(() => {
    form = null;
    addSubmission = vi.fn();
    const repository = {
      form: vi.fn(async () => (form ? { form, ownerId: 'owner-1' } : null)),
      addSubmission,
    };
    service = new FormService(repository as unknown as Repository);
  });

  const submit = (values: Record<string, FieldValue>) =>
    service.addSubmission({ formId: 'form-1', durationMs: 1000, values });

  const expectRejected = async (values: Record<string, FieldValue>) => {
    addSubmission.mockClear();
    await expect(submit(values)).rejects.toBeInstanceOf(BadRequestException);
    expect(addSubmission).not.toHaveBeenCalled();
  };

  it('throws 404 for an unknown form', async () => {
    await expect(submit({})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports the offending field in the error body', async () => {
    form = formOf([page('p1', [text('q1', { required: true })])]);
    const error: unknown = await submit({}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      error: expect.stringContaining('q1'),
    });
  });

  it('stores a valid submission', async () => {
    form = formOf([page('p1', [text('q1', { required: true })])]);

    const saved = await submit({ q1: 'hello' });

    expect(saved).toMatchObject({
      formId: 'form-1',
      formName: 'Test form',
      values: { q1: 'hello' },
    });
    expect(saved.id).toBeTruthy();
    expect(addSubmission).toHaveBeenCalledWith(saved);
  });

  describe('visible fields', () => {
    it('rejects a missing required value', async () => {
      form = formOf([page('p1', [text('q1', { required: true })])]);
      await expectRejected({});
    });

    it('rejects a value failing a validation rule', async () => {
      form = formOf([
        page('p1', [
          text('q1', {
            validations: [{ id: 'r1', rule: 'minLength', value: 5, message: 'Error' }],
          }),
        ]),
      ]);
      await expectRejected({ q1: 'abc' });
    });

    it('validates fields nested in visible groups', async () => {
      form = formOf([page('p1', [group('g1', [text('q1', { required: true })])])]);
      await expectRejected({});
    });

    it('accepts an optional field that is missing or null', async () => {
      form = formOf([page('p1', [text('q1'), text('q2')])]);
      await expect(submit({ q2: null })).resolves.toBeDefined();
    });

    it('validates fields on every page', async () => {
      form = formOf([page('p1', [text('q1')]), page('p2', [text('q2', { required: true })])]);
      await expectRejected({ q1: 'ok' });
    });

    it('accepts answers spread over several pages', async () => {
      form = formOf([page('p1', [text('q1')]), page('p2', [group('g1', [text('q2')])])]);
      const saved = await submit({ q1: 'a', q2: 'b' });
      expect(saved.values).toEqual({ q1: 'a', q2: 'b' });
    });
  });

  describe('hidden fields', () => {
    it('skips validation of a field hidden by its condition', async () => {
      form = formOf([
        page('p1', [choice('q1'), text('q2', { required: true, enabledWhen: when('q1', 'yes') })]),
      ]);
      await expect(submit({ q1: 'no' })).resolves.toBeDefined();
    });

    it('rejects a value for a field hidden by its condition', async () => {
      form = formOf([page('p1', [choice('q1'), text('q2', { enabledWhen: when('q1', 'yes') })])]);
      await expectRejected({ q1: 'no', q2: 'sneaky' });
    });

    it('rejects null for a hidden field (hidden keys must be absent)', async () => {
      form = formOf([page('p1', [choice('q1'), text('q2', { enabledWhen: when('q1', 'yes') })])]);
      await expectRejected({ q1: 'no', q2: null });
    });

    it('validates a field once its condition is met', async () => {
      form = formOf([
        page('p1', [choice('q1'), text('q2', { required: true, enabledWhen: when('q1', 'yes') })]),
      ]);
      await expectRejected({ q1: 'yes' });
      await expect(submit({ q1: 'yes', q2: 'shown' })).resolves.toBeDefined();
    });

    it('treats children of a hidden group as hidden', async () => {
      form = formOf([
        page('p1', [
          choice('q1'),
          group('g1', [text('q2', { required: true })], when('q1', 'yes')),
        ]),
      ]);
      await expect(submit({ q1: 'no' })).resolves.toBeDefined();
      await expectRejected({ q1: 'no', q2: 'sneaky' });
    });

    it('propagates group visibility through nested groups', async () => {
      form = formOf([
        page('p1', [
          choice('q1'),
          group('outer', [group('inner', [text('q2', { required: true })])], when('q1', 'yes')),
        ]),
      ]);
      await expect(submit({ q1: 'no' })).resolves.toBeDefined();
      await expectRejected({ q1: 'no', q2: 'sneaky' });
      await expectRejected({ q1: 'yes' });
    });

    it('hides a field inside a visible group by its own condition', async () => {
      form = formOf([
        page('p1', [
          choice('q1'),
          group('g1', [text('q2', { required: true, enabledWhen: when('q1', 'yes') })]),
        ]),
      ]);
      await expect(submit({ q1: 'no' })).resolves.toBeDefined();
      await expectRejected({ q1: 'no', q2: 'sneaky' });
    });

    it('treats fields on a hidden page as hidden', async () => {
      form = formOf([
        page('p1', [choice('q1')]),
        page('p2', [text('q2', { required: true })], when('q1', 'yes')),
      ]);
      await expect(submit({ q1: 'no' })).resolves.toBeDefined();
      await expectRejected({ q1: 'no', q2: 'sneaky' });
    });

    // A hidden field counts as empty, so anything depending on it is evaluated
    // against an empty value — even if the runner still holds a stale value.
    it('treats fields depending on a hidden field as hidden', async () => {
      form = formOf([
        page('p1', [
          choice('q1'),
          text('q2', { enabledWhen: when('q1', 'yes') }),
          text('q3', { required: true, enabledWhen: isNotEmpty('q2') }),
        ]),
      ]);
      await expect(submit({ q1: 'no' })).resolves.toBeDefined();
      await expectRejected({ q1: 'no', q3: 'stale' });
    });
  });

  describe('unexpected values', () => {
    it('rejects keys that are not elements of the form', async () => {
      form = formOf([page('p1', [text('q1')])]);
      await expectRejected({ q1: 'ok', unknown: 'junk' });
    });

    it('rejects unknown keys even when they are null', async () => {
      form = formOf([page('p1', [text('q1')])]);
      await expectRejected({ q1: 'ok', unknown: null });
    });

    it('rejects values for group elements', async () => {
      form = formOf([page('p1', [group('g1', [text('q1')])])]);
      await expectRejected({ g1: 'junk' });
    });

    it('rejects values for display elements', async () => {
      form = formOf([
        page('p1', [
          {
            id: 'info',
            type: 'textdisplay',
            label: 'Info',
            description: undefined,
            width: 12,
          },
        ]),
      ]);
      await expectRejected({ info: 'junk' });
    });

    it('rejects a choice value that is not one of the options', async () => {
      form = formOf([page('p1', [choice('q1')])]);
      await expectRejected({ q1: 'maybe' });
    });
  });

  describe('choice options', () => {
    it('accepts a value that is one of the options', async () => {
      form = formOf([page('p1', [choice('q1')])]);
      await expect(submit({ q1: 'yes' })).resolves.toBeDefined();
    });

    it('accepts no answer for an optional choice', async () => {
      form = formOf([page('p1', [choice('q1')])]);
      await expect(submit({ q1: null })).resolves.toBeDefined();
    });

    it('accepts a multi choice whose entries are all options', async () => {
      form = formOf([page('p1', [choice('q1', { type: 'multiChoice' })])]);
      await expect(submit({ q1: ['yes', 'no'] })).resolves.toBeDefined();
    });

    it('rejects a multi choice containing an entry that is not an option', async () => {
      form = formOf([page('p1', [choice('q1', { type: 'multiChoice' })])]);
      await expectRejected({ q1: ['yes', 'maybe'] });
    });

    it('validates dropdown values', async () => {
      form = formOf([page('p1', [choice('q1', { type: 'dropdown' })])]);
      await expectRejected({ q1: 'maybe' });
    });

    // Select controls may hand back numeric option values as strings.
    it('matches numeric option values loosely', async () => {
      const options = [
        { id: 'o1', label: 'One', value: 1 },
        { id: 'o2', label: 'Two', value: 2 },
      ];
      form = formOf([page('p1', [choice('q1', { options })])]);
      await expect(submit({ q1: '1' })).resolves.toBeDefined();
      await expect(submit({ q1: 2 })).resolves.toBeDefined();
      await expectRejected({ q1: 3 });
    });
  });

  describe('regex patterns (RE2)', () => {
    beforeAll(() => useRe2Regex());

    it('evaluates catastrophic patterns in linear time', async () => {
      form = formOf([
        page('p1', [
          text('q1', {
            validations: [{ id: 'r1', rule: 'pattern', pattern: '^(a+)+$', message: 'Error' }],
          }),
        ]),
      ]);
      const started = Date.now();
      await expectRejected({ q1: 'a'.repeat(5000) + '!' });
      expect(Date.now() - started).toBeLessThan(500);
    });

    it('still applies ordinary patterns', async () => {
      form = formOf([
        page('p1', [
          text('q1', {
            validations: [{ id: 'r1', rule: 'pattern', pattern: '^\\d{3}$', message: 'Error' }],
          }),
        ]),
      ]);
      await expect(submit({ q1: '123' })).resolves.toBeDefined();
      await expectRejected({ q1: '12a' });
    });
  });
});
