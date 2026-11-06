import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  childrenOf,
  type ChoiceElement,
  type ConditionGroup,
  type FieldValue,
  FORM_SCHEMA_VERSION,
  type FormDefinition,
  getParent,
  type GroupElement,
  type TextElement,
} from '@shared/model';
import {
  documentFromTree,
  type ElementNode,
  type GroupNode,
  type PageNode,
} from '@test/helper/forms';
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
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
    ...extra,
  };
}

function group(id: string, elements: ElementNode[], enabledWhen?: ConditionGroup): GroupNode {
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
  };
}

function page(id: string, elements: ElementNode[], enabledWhen?: ConditionGroup): PageNode {
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

function formOf(pages: PageNode[]): FormDefinition {
  return {
    id: 'form-1',
    name: 'Test form',
    version: 1,
    schemaVersion: FORM_SCHEMA_VERSION,
    settings: { navigation: 'auto' },
    ...documentFromTree(pages),
    createdAt: '',
    updatedAt: '',
  };
}

describe('FormService element creation', () => {
  let saveForm: ReturnType<typeof vi.fn>;
  let service: FormService;

  beforeEach(() => {
    saveForm = vi.fn();
    service = new FormService({ saveForm } as unknown as Repository);
  });

  const saved = (): FormDefinition => saveForm.mock.calls[0][1] as FormDefinition;

  /** Ids of the children of the page or group `parentId` in the saved form. */
  const savedChildren = (parentId: string): string[] => {
    const parent = getParent(saved(), parentId);
    return parent ? childrenOf(saved(), parent).map((e) => e.id) : [];
  };

  it('appends a generated page and persists it for the owner', async () => {
    const form = formOf([page('p1', [])]);
    const created = await service.addPage({ form, ownerId: 'owner-1' }, 'Page 2');

    expect(created).toMatchObject({ title: 'Page 2', children: [] });
    expect(created.id).toBeTruthy();
    expect(saveForm).toHaveBeenCalledWith('owner-1', expect.objectContaining({ id: 'form-1' }));
    expect(saved().pages.map((p) => p.id)).toEqual(['p1', created.id]);
  });

  it('generates an element with defaults and inserts it after a sibling', async () => {
    const form = formOf([page('p1', [text('q1'), text('q2')])]);
    const created = await service.addElement(
      { form, ownerId: 'owner-1' },
      { type: 'choice', label: 'Pick', parentId: 'p1', afterId: 'q1' },
    );

    expect(created).toMatchObject({ type: 'choice', label: 'Pick', required: false });
    expect(created.id).toBeTruthy();
    expect(savedChildren('p1')).toEqual(['q1', created.id, 'q2']);
  });

  it('uses the localized default texts sent by the client', async () => {
    const form = formOf([page('p1', [])]);
    const defaults = { option: 'Auswahl', scaleMin: 'Niedrig', scaleMax: 'Hoch' };
    const choice = await service.addElement(
      { form, ownerId: 'owner-1' },
      { type: 'dropdown', label: 'Pick', parentId: 'p1', defaults },
    );
    const scale = await service.addElement(
      { form, ownerId: 'owner-1' },
      { type: 'scale', label: 'Rate', parentId: 'p1', defaults },
    );

    expect(choice).toMatchObject({
      options: [{ label: 'Auswahl 1' }, { label: 'Auswahl 2' }],
    });
    expect(scale).toMatchObject({ minLabel: 'Niedrig', maxLabel: 'Hoch' });
  });

  it('appends to the end of a page without afterId', async () => {
    const form = formOf([page('p1', [text('q1')])]);
    const created = await service.addElement(
      { form, ownerId: 'owner-1' },
      { type: 'text', label: 'Name', parentId: 'p1' },
    );
    expect(savedChildren('p1')).toEqual(['q1', created.id]);
  });

  it('inserts into a nested group on any page', async () => {
    const form = formOf([
      page('p1', [text('q1')]),
      page('p2', [group('outer', [group('inner', [text('q2')])])]),
    ]);
    const created = await service.addElement(
      { form, ownerId: 'owner-1' },
      { type: 'number', label: 'Age', parentId: 'inner' },
    );

    expect(savedChildren('outer')).toEqual(['inner']);
    expect(savedChildren('inner')).toEqual(['q2', created.id]);
  });

  it('throws 404 without saving when the parent does not exist', async () => {
    const form = formOf([page('p1', [text('q1')])]);
    await expect(
      service.addElement(
        { form, ownerId: 'owner-1' },
        { type: 'text', label: 'x', parentId: 'q1' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('throws 404 without saving when afterId is stale', async () => {
    const form = formOf([page('p1', [text('q1')])]);
    await expect(
      service.addElement(
        { form, ownerId: 'owner-1' },
        { type: 'text', label: 'x', parentId: 'p1', afterId: 'gone' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('throws 404 without saving when afterId belongs to another container', async () => {
    const form = formOf([page('p1', [text('q1'), group('g1', [text('q2')])])]);
    await expect(
      service.addElement(
        { form, ownerId: 'owner-1' },
        { type: 'text', label: 'x', parentId: 'p1', afterId: 'q2' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saveForm).not.toHaveBeenCalled();
  });
});

describe('FormService cloning', () => {
  let saveForm: ReturnType<typeof vi.fn>;
  let service: FormService;

  beforeEach(() => {
    saveForm = vi.fn();
    service = new FormService({ saveForm } as unknown as Repository);
  });

  const saved = (): FormDefinition => saveForm.mock.calls[0][1] as FormDefinition;

  /** Ids of the children of the page or group `parentId` in the saved form. */
  const savedChildren = (parentId: string): string[] => {
    const parent = getParent(saved(), parentId);
    return parent ? childrenOf(saved(), parent).map((e) => e.id) : [];
  };

  it('clones an element subtree after its source and remaps references', async () => {
    const form = formOf([
      page('p1', [
        text('q1'),
        group('g1', [
          text('a'),
          text('b', { defaultValue: { kind: 'fromField', fieldId: 'a' } }),
          text('c', {
            enabledWhen: {
              logic: 'all',
              conditions: [
                {
                  fieldId: 'b',
                  operator: 'between',
                  operand: { kind: 'field', fieldId: 'a' },
                  operandTo: { kind: 'field', fieldId: 'a' },
                },
              ],
              groups: [],
            },
          }),
        ]),
      ]),
    ]);

    const clone = await service.cloneElement({ form, ownerId: 'owner-1' }, 'g1', {
      suffix: '(Kopie)',
    });

    expect(clone.element.id).not.toBe('g1');
    expect(clone.element.label).toBe('g1 (Kopie)');
    expect(saveForm).toHaveBeenCalledWith('owner-1', expect.objectContaining({ id: 'form-1' }));
    expect(savedChildren('p1')).toEqual(['q1', 'g1', clone.element.id]);
    expect((saved().elements[clone.element.id] as GroupElement).children).toEqual(
      clone.subtree.map((el) => el.id),
    );

    const [copiedA, copiedB, copiedC] = clone.subtree as TextElement[];
    expect(copiedB.defaultValue).toEqual({ kind: 'fromField', fieldId: copiedA.id });
    const condition = copiedC.enabledWhen?.conditions[0];
    expect(condition?.fieldId).toBe(copiedB.id);
    expect(condition?.operand).toEqual({ kind: 'field', fieldId: copiedA.id });
    expect(condition?.operandTo).toEqual({ kind: 'field', fieldId: copiedA.id });

    expect((saved().elements['b'] as TextElement).defaultValue).toEqual({
      kind: 'fromField',
      fieldId: 'a',
    });
  });

  it('throws 404 without saving for an unknown element', async () => {
    const form = formOf([page('p1', [text('q1')])]);
    await expect(
      service.cloneElement({ form, ownerId: 'owner-1' }, 'gone', { suffix: '(Kopie)' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('clones a page with all elements and remaps same-page references', async () => {
    const form = formOf([
      page('p1', [text('q1'), text('q2', { defaultValue: { kind: 'fromField', fieldId: 'q1' } })]),
      page('p2', [text('q3')]),
    ]);

    const clone = await service.clonePage({ form, ownerId: 'owner-1' }, 'p1', {
      suffix: '(Kopie)',
    });

    expect(clone.page.title).toBe('p1 (Kopie)');
    expect(clone.page.id).not.toBe('p1');
    expect(saved().pages.map((p) => p.id)).toEqual(['p1', 'p2', clone.page.id]);
    expect(clone.page.children).toHaveLength(2);

    const [copiedQ1, copiedQ2] = clone.elements as TextElement[];
    expect(copiedQ1.id).not.toBe('q1');
    expect(copiedQ2.label).toBe('q2 (Kopie)');
    expect(copiedQ2.defaultValue).toEqual({ kind: 'fromField', fieldId: copiedQ1.id });
    expect((saved().elements['q2'] as TextElement).defaultValue).toEqual({
      kind: 'fromField',
      fieldId: 'q1',
    });
  });

  it('throws 404 without saving for an unknown page', async () => {
    const form = formOf([page('p1', [text('q1')])]);
    await expect(
      service.clonePage({ form, ownerId: 'owner-1' }, 'gone', { suffix: '(Kopie)' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saveForm).not.toHaveBeenCalled();
  });
});

describe('FormService.addOption', () => {
  let saveForm: ReturnType<typeof vi.fn>;
  let service: FormService;

  beforeEach(() => {
    saveForm = vi.fn();
    service = new FormService({ saveForm } as unknown as Repository);
  });

  const savedChoice = (id: string) =>
    (saveForm.mock.calls[0][1] as FormDefinition).elements[id] as ChoiceElement;

  it('appends an option and persists it for the owner', async () => {
    const form = formOf([page('p1', [choice('q1')])]);
    const created = await service.addOption({ form, ownerId: 'owner-1' }, 'q1', {
      label: 'Maybe',
    });

    expect(created).toMatchObject({ label: 'Maybe' });
    expect(created.id).toBeTruthy();
    expect(saveForm).toHaveBeenCalledWith('owner-1', expect.objectContaining({ id: 'form-1' }));
  });

  it('throws 404 without saving for an unknown element', async () => {
    const form = formOf([page('p1', [choice('q1')])]);
    await expect(
      service.addOption({ form, ownerId: 'owner-1' }, 'gone', { label: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('throws 400 without saving for an element without options', async () => {
    const form = formOf([page('p1', [text('q1')])]);
    await expect(
      service.addOption({ form, ownerId: 'owner-1' }, 'q1', { label: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('merges a patch into an option and persists it', async () => {
    const form = formOf([page('p1', [choice('q1')])]);
    const updated = await service.updateOption({ form, ownerId: 'owner-1' }, 'q1', 'no', {
      label: 'Nope',
    });

    expect(updated).toEqual({ id: 'no', label: 'Nope' });
    expect(savedChoice('q1').options).toEqual([
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'Nope' },
    ]);
  });

  it('removes an option and persists the form', async () => {
    const form = formOf([page('p1', [choice('q1')])]);
    await service.deleteOption({ form, ownerId: 'owner-1' }, 'q1', 'yes');
    expect(savedChoice('q1').options.map((o) => o.id)).toEqual(['no']);
  });

  it('throws 404 without saving for an unknown option', async () => {
    const form = formOf([page('p1', [choice('q1')])]);
    const owned = { form, ownerId: 'owner-1' };
    await expect(service.updateOption(owned, 'q1', 'gone', { label: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.deleteOption(owned, 'q1', 'gone')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('throws 400 without saving when patching or deleting on an element without options', async () => {
    const form = formOf([page('p1', [text('q1')])]);
    const owned = { form, ownerId: 'owner-1' };
    await expect(service.updateOption(owned, 'q1', 'o1', { label: 'x' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.deleteOption(owned, 'q1', 'o1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(saveForm).not.toHaveBeenCalled();
  });
});

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

    it('accepts option ids, not labels', async () => {
      const options = [
        { id: 'o1', label: 'One' },
        { id: 'o2', label: 'Two' },
      ];
      form = formOf([page('p1', [choice('q1', { options })])]);
      await expect(submit({ q1: 'o1' })).resolves.toBeDefined();
      await expectRejected({ q1: 'One' });
    });

    it('rejects numeric answers for numeric-looking option ids', async () => {
      const options = [{ id: '1', label: 'One' }];
      form = formOf([page('p1', [choice('q1', { options })])]);
      await expect(submit({ q1: '1' })).resolves.toBeDefined();
      await expectRejected({ q1: 1 });
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
