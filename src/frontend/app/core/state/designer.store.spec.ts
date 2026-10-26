import { TestBed } from '@angular/core/testing';
import type { ConditionGroup } from '@shared/model/conditions.model';
import { createElement, createPage } from '@shared/model/form-factory';
import type {
  ChoiceElement,
  ElementDefinition,
  FormDefinition,
  GroupElement,
  PageDefinition,
  TextElement,
} from '@shared/model/form.model';
import { type CreateElementRequest, type CreateOptionRequest } from '@shared/schemas';
import { addToGroup, getElements, newForm } from '@test/helper';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignerStore } from './designer.store';
import { FormsRepository } from './forms.repository';

function conditions(fieldId: string): ConditionGroup {
  return {
    logic: 'all',
    conditions: [{ fieldId, operator: 'isNotEmpty' }],
    groups: [],
  };
}

function text(label: string): TextElement {
  return createElement('text', label) as TextElement;
}

/** Page with a group (nested children) plus a top-level field that depends on a child. */
function pageWithNestedDeps(form: FormDefinition): { page: PageDefinition; group: GroupElement } {
  const page = createPage('Page 1');
  const group = createElement('group', 'Group');
  const first = text('First');
  const second = text('Second');
  second.defaultValue = { kind: 'fromField', fieldId: first.id };
  const third = text('Third');
  third.enabledWhen = {
    logic: 'all',
    conditions: [
      {
        fieldId: second.id,
        operator: 'between',
        operand: { kind: 'field', fieldId: first.id },
        operandTo: { kind: 'field', fieldId: first.id },
      },
    ],
    groups: [],
  };

  addToGroup([first, second, third], group, form);

  const top = text('Top');
  top.enabledWhen = conditions(first.id);
  top.defaultValue = { kind: 'fromField', fieldId: first.id };

  addToGroup([group, top], page, form);
  return { page, group };
}

describe('DesignerStore clone', () => {
  let store: DesignerStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [DesignerStore] });
    store = TestBed.inject(DesignerStore);
  });

  it('clonePage remaps same-page references of nested group children', () => {
    const form = newForm('Demo');
    const { page, group } = pageWithNestedDeps(form);
    form.pages = [page];
    store.load(form);

    store.clonePage(page.id);

    const copy = store.form().pages[1];
    const copiedGroup = getElements(copy, store.form())[0] as GroupElement;
    const [copiedFirst, copiedSecond, copiedThird] = getElements(
      copiedGroup,
      store.form(),
    ) as TextElement[];
    const copiedTop = getElements(copy, store.form())[1] as TextElement;

    expect(copiedGroup.id).not.toBe(group.id);
    expect(copiedFirst.id).not.toBe(group.children[0]);
    expect(copiedSecond.id).not.toBe(group.children[1]);
    expect(copiedThird.id).not.toBe(group.children[2]);

    expect(copiedSecond.defaultValue).toEqual({ kind: 'fromField', fieldId: copiedFirst.id });
    const nestedCondition = copiedThird.enabledWhen?.conditions[0];
    expect(nestedCondition?.fieldId).toBe(copiedSecond.id);
    expect(nestedCondition?.operand).toEqual({ kind: 'field', fieldId: copiedFirst.id });
    expect(nestedCondition?.operandTo).toEqual({ kind: 'field', fieldId: copiedFirst.id });
    expect(copiedTop.defaultValue).toEqual({ kind: 'fromField', fieldId: copiedFirst.id });
    expect(copiedTop.enabledWhen?.conditions[0].fieldId).toBe(copiedFirst.id);
  });

  it('clonePage leaves references to other pages untouched', () => {
    const form = newForm('Demo');

    const source = createPage('Source');
    const sourceField = text('Source field');
    addToGroup(sourceField, source, form);

    const target = createPage('Target');
    const targetField = text('Target field');
    targetField.defaultValue = { kind: 'fromField', fieldId: sourceField.id };
    targetField.enabledWhen = conditions(sourceField.id);
    addToGroup(targetField, target, form);

    form.pages = [source, target];
    store.load(form);

    store.clonePage(target.id);

    const copy = store.form().elements[store.form().pages[2].children[0]] as TextElement;
    expect(copy.id).not.toBe(targetField.id);
    expect(copy.defaultValue).toEqual({ kind: 'fromField', fieldId: sourceField.id });
    expect(copy.enabledWhen?.conditions[0].fieldId).toBe(sourceField.id);
  });

  it('duplicateElement keeps group children ids unique', () => {
    const form = newForm('Demo');
    const { page, group } = pageWithNestedDeps(form);
    form.pages = [page];
    store.load(form);

    store.duplicateElement(group.id);

    const [, copy] = getElements(store.form().pages[0], store.form()) as [
      GroupElement,
      GroupElement,
    ];
    const [firstCopy, secondCopy, thirdCopy] = getElements(copy, store.form());
    expect(copy.id).not.toBe(group.id);
    expect(firstCopy.id).not.toBe(group.children[0]);
    expect(secondCopy.id).not.toBe(group.children[1]);
    expect(thirdCopy.id).not.toBe(group.children[2]);
    expect(getElements(copy, form)).toHaveLength(3);
  });

  it('duplicateElement remaps references inside the duplicated subtree', () => {
    const form = newForm('Demo');
    const { page, group } = pageWithNestedDeps(form);
    form.pages = [page];
    store.load(form);

    store.duplicateElement(group.id);

    const copy = getElements(store.form().pages[0], store.form())[1] as GroupElement;
    const [firstCopy, secondCopy, thirdCopy] = getElements(copy, store.form()) as TextElement[];
    const [firstOriginal, , thirdOriginal] = group.children.map(
      (id) => form.elements[id],
    ) as TextElement[];

    expect((secondCopy.defaultValue as { fieldId: string }).fieldId).toBe(firstCopy.id);
    const condition = thirdCopy.enabledWhen?.conditions[0];
    expect(condition?.fieldId).toBe(secondCopy.id);
    expect(condition?.operand).toEqual({ kind: 'field', fieldId: firstCopy.id });
    expect(condition?.operandTo).toEqual({ kind: 'field', fieldId: firstCopy.id });

    // The original group keeps its own references.
    expect((form.elements[group.children[1]] as TextElement).defaultValue).toEqual({
      kind: 'fromField',
      fieldId: firstOriginal.id,
    });
    expect(thirdOriginal.enabledWhen?.conditions[0].fieldId).toBe(group.children[1]);
  });

  it('duplicateElement leaves references to other fields untouched', () => {
    const form = newForm('Demo');
    const { page } = pageWithNestedDeps(form);
    form.pages = [page];
    store.load(form);

    const top = getElements(page, form)[1] as TextElement;
    const nestedFirstId = (getElements(page, form)[0] as GroupElement).children[0];

    store.duplicateElement(top.id);

    const copy = getElements(store.form().pages[0], store.form())[2] as TextElement;
    expect(copy.id).not.toBe(top.id);
    expect(copy.defaultValue).toEqual({ kind: 'fromField', fieldId: nestedFirstId });
    expect(copy.enabledWhen?.conditions[0].fieldId).toBe(nestedFirstId);
  });
});

describe('DesignerStore moveElementTo', () => {
  let store: DesignerStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [DesignerStore] });
    store = TestBed.inject(DesignerStore);
  });

  /** group → [a, b], top-level: [c, group, d] */
  function scenario() {
    const form = newForm('Demo');

    const page = createPage('Page 1');
    const group = createElement('group', 'Group') as GroupElement;
    const a = text('A');
    const b = text('B');
    const c = text('C');
    const d = text('D');
    addToGroup([a, b], group, form);
    addToGroup([c, group, d], page, form);
    form.pages = [page];
    store.load(form);
    return { page, group, a, b, c, d };
  }

  const root = () => getElements(store.form().pages[0], store.form());

  const childrenOf = (id: string) => {
    const form = store.form();
    return (form.elements[id] as GroupElement).children.map((id) => form.elements[id]) ?? [];
  };
  const ids = (els: ElementDefinition[]) => els.map((e) => e.label);

  it('moves a top-level element into a group', () => {
    const { group, c } = scenario();

    store.moveElementTo(c.id, group.id, 1);

    expect(ids(root())).toEqual(['Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['A', 'C', 'B']);
  });

  it('moves a group child back out to the page root', () => {
    const { page, group, a } = scenario();

    store.moveElementTo(a.id, page.id, 0);

    expect(ids(root())).toEqual(['A', 'C', 'Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['B']);
  });

  it('moves an element between two groups', () => {
    const { d } = scenario();
    const other = createElement('group', 'Other') as GroupElement;
    addToGroup(text('E'), other, store.form());
    const page = store.form().pages[0];
    addToGroup(other, page, store.form());

    store.moveElementTo(d.id, other.id, 0);

    expect(ids(root())).toEqual(['C', 'Group', 'Other']);
    expect(ids(childrenOf(other.id))).toEqual(['D', 'E']);
  });

  it('reorders within the same container', () => {
    const { group, a } = scenario();

    store.moveElementTo(a.id, group.id, 1);

    expect(ids(childrenOf(group.id))).toEqual(['B', 'A']);
  });

  it('clamps an out-of-range index instead of dropping the element', () => {
    const { group, a } = scenario();

    store.moveElementTo(a.id, group.id, 99);

    expect(ids(childrenOf(group.id))).toEqual(['B', 'A']);
  });

  it('refuses to move a group into its own descendant', () => {
    const { group } = scenario();
    const inner = createElement('group', 'Inner') as GroupElement;
    addToGroup(text('F'), inner, store.form());
    addToGroup(inner, group, store.form());
    const innerId = childrenOf(group.id).at(-1)?.id as string;

    store.moveElementTo(group.id, innerId, 0);

    expect(ids(root())).toEqual(['C', 'Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['A', 'B', 'Inner']);
    expect(ids(childrenOf(innerId))).toEqual(['F']);
  });

  it('persists the move and marks the form dirty', () => {
    const { group, c } = scenario();
    expect(store.dirty()).toBe(false);

    store.moveElementTo(c.id, group.id, 0);

    expect(store.dirty()).toBe(true);
    expect(store.form().updatedAt).not.toBe('');
    expect(ids(childrenOf(group.id))).toEqual(['C', 'A', 'B']);
  });

  it('keeps the element in place when the target group does not exist', () => {
    const { c } = scenario();
    const before = store.form().pages;

    store.moveElementTo(c.id, 'missing-group', 0);

    expect(store.form().pages).toBe(before);
    expect(store.dirty()).toBe(false);
    expect(ids(root())).toEqual(['C', 'Group', 'D']);
  });
});

describe('DesignerStore server-side creation', () => {
  let store: DesignerStore;
  const calls: string[] = [];
  const repo = {
    saveForm: vi.fn(async () => calls.push('save')),
    addPage: vi.fn(async (_formId: string, title: string) => {
      calls.push('addPage');
      return createPage(title);
    }),
    addElement: vi.fn(async (_formId: string, request: CreateElementRequest) => {
      calls.push('addElement');
      return createElement(request.type, request.label);
    }),
    addOption: vi.fn(async (_formId: string, _elementId: string, request: CreateOptionRequest) => {
      calls.push('addOption');
      return { id: 'opt-new', label: request.label, value: 'option_3' };
    }),
  };

  beforeEach(() => {
    localStorage.clear();
    calls.length = 0;
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [DesignerStore, { provide: FormsRepository, useValue: repo }],
    });
    store = TestBed.inject(DesignerStore);
  });

  function loaded(): { page: PageDefinition; group: GroupElement } {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const group = createElement('group', 'Group');
    addToGroup(text('Child'), group, form);
    addToGroup([text('A'), group, text('B')], page, form);
    form.pages = [page];
    store.load(form);
    return { page, group };
  }

  it('inserts the server-generated element after a sibling and selects it', async () => {
    const { page } = loaded();
    const el = await store.addElement(
      page.id,
      'number',
      'Age',
      getElements(page, store.form())[0].id,
    );

    expect(repo.addElement).toHaveBeenCalledWith(store.form().id, {
      type: 'number',
      label: 'Age',
      parentId: page.id,
      afterId: getElements(page, store.form())[0].id,
    });
    expect(getElements(store.form().pages[0], store.form())[1]).toEqual(el);
    expect(store.selectedId()).toBe(el.id);
    expect(store.dirty()).toBe(false);
  });

  it('appends a server-generated child to a group', async () => {
    const { group } = loaded();
    const el = await store.addElement(group.id, 'text', 'Child 2');
    const stored = getElements(store.form().pages[0], store.form())[1] as GroupElement;
    expect(getElements(stored, store.form()).map((e) => e.id)).toEqual([
      getElements(group, store.form())[0].id,
      el.id,
    ]);
  });

  it('appends a server-generated page and activates it', async () => {
    loaded();
    const page = await store.addPage();
    expect(repo.addPage).toHaveBeenCalledWith(store.form().id, 'Page 2');
    expect(store.form().pages.at(-1)).toEqual(page);
    expect(store.activePageId()).toBe(page.id);
  });

  function loadedChoice(): ChoiceElement {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const choice = createElement('dropdown', 'Pick') as ChoiceElement;
    addToGroup(choice, page, form);
    form.pages = [page];
    store.load(form);
    return choice;
  }

  it('saves unsaved edits, then appends a server-generated option', async () => {
    const choice = loadedChoice();
    store.updateElement(choice.id, { label: 'Renamed' });

    const option = await store.addOption(choice.id, 'Option 3');

    expect(calls).toEqual(['save', 'addOption']);
    expect(repo.addOption).toHaveBeenCalledWith(store.form().id, choice.id, { label: 'Option 3' });
    const stored = store.form().elements[choice.id] as ChoiceElement;
    expect(stored.options.at(-1)).toEqual(option);
    expect(stored.options).toHaveLength(3);
    expect(store.dirty()).toBe(false);
  });

  it('drops the option locally when its element was removed during the request', async () => {
    const choice = loadedChoice();
    repo.addOption.mockImplementationOnce(async (_formId, _elementId, request) => {
      store.load({
        ...store.form(),
        pages: [{ ...store.form().pages[0], children: [] }],
        elements: {},
      });
      return { id: 'opt-new', label: request.label, value: 'option_3' };
    });

    await store.addOption(choice.id, 'Option 3');

    expect(store.form().elements[choice.id]).toBeUndefined();
  });

  it('saves unsaved edits before creating, and runs creations one at a time', async () => {
    const { page } = loaded();
    store.rename('Renamed');
    await Promise.all([store.addElement(page.id, 'text'), store.addElement(page.id, 'text')]);
    expect(calls).toEqual(['save', 'addElement', 'addElement']);
    expect(getElements(store.form().pages[0], store.form())).toHaveLength(5);
  });

  it('appends the element when its anchor sibling was removed during the request', async () => {
    const { page } = loaded();
    const anchor = getElements(page, store.form())[0];
    repo.addElement.mockImplementationOnce(async (_formId, request) => {
      store.load({
        ...store.form(),
        pages: [
          {
            ...page,
            children: getElements(page, store.form())
              .slice(1)
              .map((e) => e.id),
          },
        ],
      });
      return createElement(request.type, request.label);
    });
    const el = await store.addElement(page.id, 'text', 'New', anchor.id);
    expect(getElements(store.form().pages[0], store.form()).at(-1)).toEqual(el);
    expect(store.selectedId()).toBe(el.id);
  });

  it('does not select the element when its parent was removed during the request', async () => {
    const { page, group } = loaded();

    repo.addElement.mockImplementationOnce(async (_formId, request) => {
      store.load({
        ...store.form(),
        pages: [
          {
            ...page,
            children: getElements(page, store.form())
              .filter((e) => e.id !== group.id)
              .map((e) => e.id),
          },
        ],
      });
      delete store.form().elements[group.id];
      return createElement(request.type, request.label);
    });
    await store.addElement(group.id, 'text', 'Orphan');
    expect(getElements(store.form().pages[0], store.form())).toHaveLength(2);
    expect(store.selectedId()).toBeNull();
  });

  it('drops queued and pending creations once another form is loaded', async () => {
    const { page } = loaded();
    const other = newForm('Other');
    other.pages = [createPage('Other page')];
    let release!: () => void;
    repo.addElement.mockImplementationOnce(async (_formId, request) => {
      await new Promise<void>((resolve) => (release = resolve));
      return createElement(request.type, request.label);
    });
    const pending = store.addElement(page.id, 'text');
    const queued = store.addPage();
    await vi.waitFor(() => expect(release).toBeDefined());
    store.load(other);
    release();

    await expect(pending).rejects.toThrow('form changed');
    await expect(queued).rejects.toThrow('form changed');
    expect(repo.addPage).not.toHaveBeenCalled();
    expect(store.form()).toBe(other);
  });
});
