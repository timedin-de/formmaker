import { TestBed } from '@angular/core/testing';
import type { ConditionGroup } from '@shared/model/conditions.model';
import { createElement, createPage } from '@shared/model/form-factory';
import type {
  ElementDefinition,
  GroupElement,
  PageDefinition,
  TextElement,
} from '@shared/model/form.model';
import { type CreateElementRequest } from '@shared/schemas';
import { newForm } from '@test/helper';
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
function pageWithNestedDeps(): { page: PageDefinition; group: GroupElement } {
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
  group.elements = [first, second, third];

  const top = text('Top');
  top.enabledWhen = conditions(first.id);
  top.defaultValue = { kind: 'fromField', fieldId: first.id };

  page.elements = [group, top];
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
    const { page, group } = pageWithNestedDeps();
    const form = newForm('Demo');
    form.pages = [page];
    store.load(form);

    store.clonePage(page.id);

    const copy = store.form().pages[1];
    const copiedGroup = copy.elements[0] as GroupElement;
    const [copiedFirst, copiedSecond, copiedThird] = copiedGroup.elements as TextElement[];
    const copiedTop = copy.elements[1] as TextElement;

    expect(copiedGroup.id).not.toBe(group.id);
    expect(copiedFirst.id).not.toBe(group.elements[0].id);
    expect(copiedSecond.id).not.toBe(group.elements[1].id);
    expect(copiedThird.id).not.toBe(group.elements[2].id);

    expect(copiedSecond.defaultValue).toEqual({ kind: 'fromField', fieldId: copiedFirst.id });
    const nestedCondition = copiedThird.enabledWhen?.conditions[0];
    expect(nestedCondition?.fieldId).toBe(copiedSecond.id);
    expect(nestedCondition?.operand).toEqual({ kind: 'field', fieldId: copiedFirst.id });
    expect(nestedCondition?.operandTo).toEqual({ kind: 'field', fieldId: copiedFirst.id });
    expect(copiedTop.defaultValue).toEqual({ kind: 'fromField', fieldId: copiedFirst.id });
    expect(copiedTop.enabledWhen?.conditions[0].fieldId).toBe(copiedFirst.id);
  });

  it('clonePage leaves references to other pages untouched', () => {
    const source = createPage('Source');
    const sourceField = text('Source field');
    source.elements = [sourceField];

    const target = createPage('Target');
    const targetField = text('Target field');
    targetField.defaultValue = { kind: 'fromField', fieldId: sourceField.id };
    targetField.enabledWhen = conditions(sourceField.id);
    target.elements = [targetField];

    const form = newForm('Demo');
    form.pages = [source, target];
    store.load(form);

    store.clonePage(target.id);

    const copy = store.form().pages[2].elements[0] as TextElement;
    expect(copy.id).not.toBe(targetField.id);
    expect(copy.defaultValue).toEqual({ kind: 'fromField', fieldId: sourceField.id });
    expect(copy.enabledWhen?.conditions[0].fieldId).toBe(sourceField.id);
  });

  it('duplicateElement keeps group children ids unique', () => {
    const { page, group } = pageWithNestedDeps();
    const form = newForm('Demo');
    form.pages = [page];
    store.load(form);

    store.duplicateElement(group.id);

    const [, copy] = store.form().pages[0].elements as [GroupElement, GroupElement];
    const [firstCopy, secondCopy, thirdCopy] = copy.elements;
    expect(copy.id).not.toBe(group.id);
    expect(firstCopy.id).not.toBe(group.elements[0].id);
    expect(secondCopy.id).not.toBe(group.elements[1].id);
    expect(thirdCopy.id).not.toBe(group.elements[2].id);
    expect(copy.elements).toHaveLength(3);
  });

  it('duplicateElement remaps references inside the duplicated subtree', () => {
    const { page, group } = pageWithNestedDeps();
    const form = newForm('Demo');
    form.pages = [page];
    store.load(form);

    store.duplicateElement(group.id);

    const copy = store.form().pages[0].elements[1] as GroupElement;
    const [firstCopy, secondCopy, thirdCopy] = copy.elements as TextElement[];
    const [firstOriginal, , thirdOriginal] = group.elements as TextElement[];

    expect((secondCopy.defaultValue as { fieldId: string }).fieldId).toBe(firstCopy.id);
    const condition = thirdCopy.enabledWhen?.conditions[0];
    expect(condition?.fieldId).toBe(secondCopy.id);
    expect(condition?.operand).toEqual({ kind: 'field', fieldId: firstCopy.id });
    expect(condition?.operandTo).toEqual({ kind: 'field', fieldId: firstCopy.id });

    // The original group keeps its own references.
    expect((group.elements[1] as TextElement).defaultValue).toEqual({
      kind: 'fromField',
      fieldId: firstOriginal.id,
    });
    expect(thirdOriginal.enabledWhen?.conditions[0].fieldId).toBe(group.elements[1].id);
  });

  it('duplicateElement leaves references to other fields untouched', () => {
    const { page } = pageWithNestedDeps();
    const form = newForm('Demo');
    form.pages = [page];
    store.load(form);

    const top = page.elements[1] as TextElement;
    const nestedFirstId = (page.elements[0] as GroupElement).elements[0].id;

    store.duplicateElement(top.id);

    const copy = store.form().pages[0].elements[2] as TextElement;
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
    const page = createPage('Page 1');
    const group = createElement('group', 'Group') as GroupElement;
    const a = text('A');
    const b = text('B');
    const c = text('C');
    const d = text('D');
    group.elements = [a, b];
    page.elements = [c, group, d];
    const form = newForm('Demo');
    form.pages = [page];
    store.load(form);
    return { page, group, a, b, c, d };
  }

  const root = () => store.form().pages[0].elements;
  const findGroup = (els: ElementDefinition[], id: string): GroupElement | null => {
    for (const el of els) {
      if (el.id === id && el.type === 'group') return el;
      if (el.type === 'group') {
        const nested = findGroup(el.elements, id);
        if (nested) return nested;
      }
    }
    return null;
  };
  const childrenOf = (id: string) => findGroup(root(), id)?.elements ?? [];
  const ids = (els: ElementDefinition[]) => els.map((e) => e.label);

  it('moves a top-level element into a group', () => {
    const { group, c } = scenario();

    store.moveElementTo(c.id, group.id, 1);

    expect(ids(root())).toEqual(['Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['A', 'C', 'B']);
  });

  it('moves a group child back out to the page root', () => {
    const { group, a } = scenario();

    store.moveElementTo(a.id, null, 0);

    expect(ids(root())).toEqual(['A', 'C', 'Group', 'D']);
    expect(ids(childrenOf(group.id))).toEqual(['B']);
  });

  it('moves an element between two groups', () => {
    const { d } = scenario();
    const other = createElement('group', 'Other') as GroupElement;
    other.elements = [text('E')];
    const page = store.form().pages[0];
    store.updatePage(page.id, { elements: [...page.elements, other] });

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
    inner.elements = [text('F')];
    store.updateElement(group.id, { elements: [...group.elements, inner] });
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
    const page = createPage('Page 1');
    const group = createElement('group', 'Group');
    group.elements = [text('Child')];
    page.elements = [text('A'), group, text('B')];
    const form = newForm('Demo');
    form.pages = [page];
    store.load(form);
    return { page, group };
  }

  it('inserts the server-generated element after a sibling and selects it', async () => {
    const { page } = loaded();
    const el = await store.addElement(page.id, 'number', 'Age', page.elements[0].id);

    expect(repo.addElement).toHaveBeenCalledWith(store.form().id, {
      type: 'number',
      label: 'Age',
      parentId: page.id,
      afterId: page.elements[0].id,
    });
    expect(store.form().pages[0].elements[1]).toEqual(el);
    expect(store.selectedId()).toBe(el.id);
    expect(store.dirty()).toBe(false);
  });

  it('appends a server-generated child to a group', async () => {
    const { group } = loaded();
    const el = await store.addElement(group.id, 'text', 'Child 2');
    const stored = store.form().pages[0].elements[1] as GroupElement;
    expect(stored.elements.map((e) => e.id)).toEqual([group.elements[0].id, el.id]);
  });

  it('appends a server-generated page and activates it', async () => {
    loaded();
    const page = await store.addPage();
    expect(repo.addPage).toHaveBeenCalledWith(store.form().id, 'Page 2');
    expect(store.form().pages.at(-1)).toEqual(page);
    expect(store.activePageId()).toBe(page.id);
  });

  it('saves unsaved edits before creating, and runs creations one at a time', async () => {
    const { page } = loaded();
    store.rename('Renamed');
    await Promise.all([store.addElement(page.id, 'text'), store.addElement(page.id, 'text')]);
    expect(calls).toEqual(['save', 'addElement', 'addElement']);
    expect(store.form().pages[0].elements).toHaveLength(5);
  });

  it('appends the element when its anchor sibling was removed during the request', async () => {
    const { page } = loaded();
    const anchor = page.elements[0];
    repo.addElement.mockImplementationOnce(async (_formId, request) => {
      store.load({ ...store.form(), pages: [{ ...page, elements: page.elements.slice(1) }] });
      return createElement(request.type, request.label);
    });
    const el = await store.addElement(page.id, 'text', 'New', anchor.id);
    expect(store.form().pages[0].elements.at(-1)).toEqual(el);
    expect(store.selectedId()).toBe(el.id);
  });

  it('does not select the element when its parent was removed during the request', async () => {
    const { page, group } = loaded();
    repo.addElement.mockImplementationOnce(async (_formId, request) => {
      store.load({
        ...store.form(),
        pages: [{ ...page, elements: page.elements.filter((e) => e.id !== group.id) }],
      });
      return createElement(request.type, request.label);
    });
    await store.addElement(group.id, 'text', 'Orphan');
    expect(store.form().pages[0].elements).toHaveLength(2);
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
