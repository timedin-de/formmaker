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
import type { Repository, User } from '../repository';
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

  it('creates a new form whose first page has the localized title', async () => {
    const user = { id: 'owner-1', email: 'a@b.c', role: 'editor' } as unknown as User;
    await service.newForm(user, 'Seite 1');

    expect(saveForm).toHaveBeenCalledWith('owner-1', expect.anything());
    expect(saved().pages.map((p) => p.title)).toEqual(['Seite 1']);
  });

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

describe('FormService moveElement', () => {
  let saveForm: ReturnType<typeof vi.fn>;
  let service: FormService;

  beforeEach(() => {
    saveForm = vi.fn();
    service = new FormService({ saveForm } as unknown as Repository);
  });

  const saved = (): FormDefinition => saveForm.mock.calls[0][1] as FormDefinition;
  const savedChildren = (parentId: string): string[] => {
    const parent = getParent(saved(), parentId);
    return parent ? childrenOf(saved(), parent).map((e) => e.id) : [];
  };

  /** p1 → [q1, g1 → [q2, q3], q4], p2 → [q5] */
  const sample = () =>
    formOf([
      page('p1', [text('q1'), group('g1', [text('q2'), text('q3')]), text('q4')]),
      page('p2', [text('q5')]),
    ]);

  it('reorders within the same parent, counting the index after detaching', async () => {
    await service.moveElement({ form: sample(), ownerId: 'owner-1' }, 'q1', {
      parentId: 'p1',
      index: 2,
    });

    expect(saveForm).toHaveBeenCalledWith('owner-1', expect.objectContaining({ id: 'form-1' }));
    expect(savedChildren('p1')).toEqual(['g1', 'q4', 'q1']);
  });

  it('moves an element into a group on another page', async () => {
    const form = sample();
    await service.moveElement({ form, ownerId: 'owner-1' }, 'q5', { parentId: 'g1', index: 1 });

    expect(savedChildren('p2')).toEqual([]);
    expect(savedChildren('g1')).toEqual(['q2', 'q5', 'q3']);
  });

  it('moves a group together with its children', async () => {
    await service.moveElement({ form: sample(), ownerId: 'owner-1' }, 'g1', {
      parentId: 'p2',
      index: 0,
    });

    expect(savedChildren('p1')).toEqual(['q1', 'q4']);
    expect(savedChildren('p2')).toEqual(['g1', 'q5']);
    expect(savedChildren('g1')).toEqual(['q2', 'q3']);
  });

  it('clamps an index past the end', async () => {
    await service.moveElement({ form: sample(), ownerId: 'owner-1' }, 'q2', {
      parentId: 'g1',
      index: 99,
    });

    expect(savedChildren('g1')).toEqual(['q3', 'q2']);
  });

  it('throws 404 without saving for an unknown element', async () => {
    await expect(
      service.moveElement({ form: sample(), ownerId: 'owner-1' }, 'gone', {
        parentId: 'p1',
        index: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('throws 404 without saving when the parent is not a page or group', async () => {
    await expect(
      service.moveElement({ form: sample(), ownerId: 'owner-1' }, 'q1', {
        parentId: 'q4',
        index: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('throws 400 without saving when moving a group into itself', async () => {
    const form = formOf([page('p1', [group('outer', [group('inner', [text('q1')])])])]);
    for (const parentId of ['outer', 'inner']) {
      await expect(
        service.moveElement({ form, ownerId: 'owner-1' }, 'outer', { parentId, index: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(saveForm).not.toHaveBeenCalled();
  });
});

describe('FormService moveOption', () => {
  let saveForm: ReturnType<typeof vi.fn>;
  let service: FormService;

  beforeEach(() => {
    saveForm = vi.fn();
    service = new FormService({ saveForm } as unknown as Repository);
  });

  const savedOptions = (): string[] =>
    ((saveForm.mock.calls[0][1] as FormDefinition).elements['c1'] as ChoiceElement).options.map(
      (o) => o.id,
    );
  const sample = () =>
    formOf([
      page('p1', [
        choice('c1', {
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
            { id: 'c', label: 'C' },
          ],
        }),
        text('q1'),
      ]),
    ]);

  it('moves an option, counting the index after taking it out', async () => {
    await service.moveOption({ form: sample(), ownerId: 'owner-1' }, 'c1', 'a', { index: 2 });

    expect(saveForm).toHaveBeenCalledWith('owner-1', expect.objectContaining({ id: 'form-1' }));
    expect(savedOptions()).toEqual(['b', 'c', 'a']);
  });

  it('clamps an index past the end', async () => {
    await service.moveOption({ form: sample(), ownerId: 'owner-1' }, 'c1', 'b', { index: 9 });

    expect(savedOptions()).toEqual(['a', 'c', 'b']);
  });

  it('throws 404 without saving for an unknown element or option', async () => {
    for (const [elementId, optionId] of [
      ['gone', 'a'],
      ['c1', 'gone'],
    ]) {
      await expect(
        service.moveOption({ form: sample(), ownerId: 'owner-1' }, elementId, optionId, {
          index: 0,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('throws 400 without saving for an element without options', async () => {
    await expect(
      service.moveOption({ form: sample(), ownerId: 'owner-1' }, 'q1', 'a', { index: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(saveForm).not.toHaveBeenCalled();
  });
});

describe('FormService updateForm', () => {
  it('patches name and description, merges settings and keeps the document', async () => {
    const saveForm = vi.fn();
    const service = new FormService({ saveForm } as unknown as Repository);
    const form = formOf([page('p1', [text('q1')])]);
    form.settings = { navigation: 'auto', showProgress: true };

    await service.updateForm(
      { form, ownerId: 'owner-1' },
      { name: 'Sign-up', description: 'For the event', settings: { navigation: 'linear' } },
    );

    expect(saveForm).toHaveBeenCalledWith('owner-1', expect.anything());
    const saved = saveForm.mock.calls[0][1] as FormDefinition;
    expect(saved).toMatchObject({ name: 'Sign-up', description: 'For the event' });
    expect(saved.settings).toEqual({ navigation: 'linear', showProgress: true });
    expect(saved.pages).toBe(form.pages);
    expect(saved.elements).toBe(form.elements);
  });
});

describe('FormService updatePage', () => {
  let saveForm: ReturnType<typeof vi.fn>;
  let service: FormService;

  beforeEach(() => {
    saveForm = vi.fn();
    service = new FormService({ saveForm } as unknown as Repository);
  });

  const saved = (): FormDefinition => saveForm.mock.calls[0][1] as FormDefinition;
  const sample = () => formOf([page('p1', [text('q1')], isNotEmpty('q1')), page('p2', [])]);

  it('merges the patch, stores it for the owner and returns the stored page', async () => {
    const updated = await service.updatePage({ form: sample(), ownerId: 'owner-1' }, 'p1', {
      title: 'Contact',
      subtitle: 'How to reach you',
    });

    expect(saveForm).toHaveBeenCalledWith('owner-1', expect.objectContaining({ id: 'form-1' }));
    expect(updated).toMatchObject({ id: 'p1', title: 'Contact', children: ['q1'] });
    expect(saved().pages).toEqual([updated, expect.objectContaining({ id: 'p2' })]);
  });

  it('removes the condition sent as null', async () => {
    await service.updatePage({ form: sample(), ownerId: 'owner-1' }, 'p1', {
      enabledWhen: null,
    });

    expect(saved().pages[0]).not.toHaveProperty('enabledWhen');
  });

  it('throws 404 without saving for an unknown page', async () => {
    await expect(
      service.updatePage({ form: sample(), ownerId: 'owner-1' }, 'gone', { title: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saveForm).not.toHaveBeenCalled();
  });
});

describe('FormService updateElement', () => {
  let saveForm: ReturnType<typeof vi.fn>;
  let service: FormService;

  beforeEach(() => {
    saveForm = vi.fn();
    service = new FormService({ saveForm } as unknown as Repository);
  });

  const saved = (): FormDefinition => saveForm.mock.calls[0][1] as FormDefinition;
  const sample = () =>
    formOf([page('p1', [text('q1', { enabledWhen: isNotEmpty('q2') }), text('q2')])]);

  it('merges the patch, stores it for the owner and returns the stored element', async () => {
    const updated = await service.updateElement({ form: sample(), ownerId: 'owner-1' }, 'q1', {
      label: 'Name',
      description: 'As in your passport',
      required: true,
    });

    expect(saveForm).toHaveBeenCalledWith('owner-1', expect.objectContaining({ id: 'form-1' }));
    expect(updated).toMatchObject({ label: 'Name', description: 'As in your passport' });
    expect(saved().elements['q1']).toEqual(updated);
    expect(saved().elements['q1']).toMatchObject({ required: true, placeholder: '' });
  });

  it('removes a field sent as null', async () => {
    await service.updateElement({ form: sample(), ownerId: 'owner-1' }, 'q1', {
      enabledWhen: null,
    });

    expect(saved().elements['q1']).not.toHaveProperty('enabledWhen');
  });

  it('pairs the children of a group copying its default from another group', async () => {
    const form = formOf([page('p1', [group('g1', [text('a')]), group('g2', [text('b')])])]);

    await service.updateElement({ form, ownerId: 'owner-1' }, 'g2', {
      defaultValue: { kind: 'fromField', fieldId: 'g1' },
    });

    expect(saved().elements['b']).toMatchObject({
      defaultValue: { kind: 'fromField', fieldId: 'a' },
    });
  });

  it('throws 404 without saving for an unknown element', async () => {
    await expect(
      service.updateElement({ form: sample(), ownerId: 'owner-1' }, 'gone', { label: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('throws 400 without saving for a field the element type lacks', async () => {
    await expect(
      service.updateElement({ form: sample(), ownerId: 'owner-1' }, 'q1', { rows: 4 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('throws 400 without saving when removing a field the type requires', async () => {
    const form = formOf([
      page('p1', [
        {
          id: 's1',
          type: 'scale',
          label: 's1',
          description: undefined,
          width: 12,
          required: false,
          validations: [],
          readonly: false,
          defaultValue: null,
          min: 1,
          max: 5,
          step: 1,
        },
      ]),
    ]);

    await expect(
      service.updateElement({ form, ownerId: 'owner-1' }, 's1', { step: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
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
    expect(copiedQ2.label).toBe('q2');
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

describe('FormService.addValidationRule', () => {
  let saveForm: ReturnType<typeof vi.fn>;
  let service: FormService;

  beforeEach(() => {
    saveForm = vi.fn();
    service = new FormService({ saveForm } as unknown as Repository);
  });

  const savedText = (id: string) =>
    (saveForm.mock.calls[0][1] as FormDefinition).elements[id] as TextElement;

  it('appends a rule with a server-generated id and persists it for the owner', async () => {
    const form = formOf([page('p1', [text('q1')])]);
    const created = await service.addValidationRule({ form, ownerId: 'owner-1' }, 'q1', {
      rule: 'email',
      message: 'Not an email',
    });

    expect(created).toEqual({ id: expect.any(String), rule: 'email', message: 'Not an email' });
    expect(saveForm).toHaveBeenCalledWith('owner-1', expect.objectContaining({ id: 'form-1' }));
    expect(savedText('q1').validations).toEqual([created]);
  });

  it('allows a repeatable rule more than once', async () => {
    const existing = { id: 'r1', rule: 'pattern' as const, message: 'x', pattern: 'a' };
    const form = formOf([page('p1', [text('q1', { validations: [existing] })])]);
    const created = await service.addValidationRule({ form, ownerId: 'owner-1' }, 'q1', {
      rule: 'pattern',
      message: 'y',
    });

    expect(created.id).not.toBe('r1');
    expect(savedText('q1').validations).toEqual([existing, created]);
  });

  it('throws 404 without saving for an unknown element', async () => {
    const form = formOf([page('p1', [text('q1')])]);
    await expect(
      service.addValidationRule({ form, ownerId: 'owner-1' }, 'gone', {
        rule: 'email',
        message: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(saveForm).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-question', formOf([page('p1', [group('g1', [])])]), 'g1', 'email'],
    ['a rule its type does not offer', formOf([page('p1', [text('q1')])]), 'q1', 'minFiles'],
    [
      'a second non-repeatable rule',
      formOf([
        page('p1', [text('q1', { validations: [{ id: 'r1', rule: 'email', message: 'x' }] })]),
      ]),
      'q1',
      'email',
    ],
  ] as const)('throws 400 without saving for %s', async (_case, form, elementId, rule) => {
    await expect(
      service.addValidationRule({ form, ownerId: 'owner-1' }, elementId, { rule, message: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(saveForm).not.toHaveBeenCalled();
  });
});

describe('FormService validation rule edits', () => {
  let saveForm: ReturnType<typeof vi.fn>;
  let service: FormService;
  const email = { id: 'r1', rule: 'email' as const, message: 'Not an email' };
  const pattern = { id: 'r2', rule: 'pattern' as const, message: 'x', pattern: 'a' };
  const owned = () => ({
    form: formOf([page('p1', [text('q1', { validations: [email, pattern] }), group('g1', [])])]),
    ownerId: 'owner-1',
  });

  beforeEach(() => {
    saveForm = vi.fn();
    service = new FormService({ saveForm } as unknown as Repository);
  });

  const savedText = (id: string) =>
    (saveForm.mock.calls[0][1] as FormDefinition).elements[id] as TextElement;

  it('merges a patch into a rule, keeping id and type, and persists it', async () => {
    const updated = await service.updateValidationRule(owned(), 'q1', 'r2', {
      message: 'No match',
      pattern: 'b+',
    });

    expect(updated).toEqual({ id: 'r2', rule: 'pattern', message: 'No match', pattern: 'b+' });
    expect(saveForm).toHaveBeenCalledWith('owner-1', expect.objectContaining({ id: 'form-1' }));
    expect(savedText('q1').validations).toEqual([email, updated]);
  });

  it.each([
    ['an invalid regex', 'r2', { pattern: '(' }],
    ['a non-numeric bound', 'r3', { value: { a: 1 } }],
    ['a non-numeric upper bound', 'r4', { valueTo: 'abc' }],
  ] as const)('rejects %s without saving', async (_case, ruleId, patch) => {
    const min = { id: 'r3', rule: 'min' as const, message: 'x' };
    const between = { id: 'r4', rule: 'between' as const, message: 'x', value: 1 };
    const form = formOf([page('p1', [text('q1', { validations: [pattern, min, between] })])]);

    await expect(
      service.updateValidationRule({ form, ownerId: 'owner-1' }, 'q1', ruleId, patch),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('accepts numeric strings and empty bounds', async () => {
    const between = { id: 'r4', rule: 'between' as const, message: 'x' };
    const form = formOf([page('p1', [text('q1', { validations: [between] })])]);

    const updated = await service.updateValidationRule({ form, ownerId: 'owner-1' }, 'q1', 'r4', {
      value: '2.5',
      valueTo: '',
    });

    expect(updated).toMatchObject({ value: '2.5', valueTo: '' });
  });

  it('removes a rule and persists the rest', async () => {
    await service.deleteValidationRule(owned(), 'q1', 'r1');

    expect(savedText('q1').validations).toEqual([pattern]);
  });

  it.each([
    ['an unknown element', 'gone', 'r1', NotFoundException],
    ['an unknown rule', 'q1', 'gone', NotFoundException],
    ['a non-question', 'g1', 'r1', BadRequestException],
  ] as const)('throws without saving for %s', async (_case, elementId, ruleId, error) => {
    await expect(
      service.updateValidationRule(owned(), elementId, ruleId, { message: 'x' }),
    ).rejects.toBeInstanceOf(error);
    await expect(service.deleteValidationRule(owned(), elementId, ruleId)).rejects.toBeInstanceOf(
      error,
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
