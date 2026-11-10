import { addToGroup, getElements, newForm } from '@test/helper';
import { describe, expect, it } from 'vitest';
import type { ConditionGroup } from './conditions.model';
import { createElement, createPage } from './form-factory';
import { cloneElement, clonePage, moveOptionTo, patchElement, patchPage } from './form-ops';
import type {
  ChoiceElement,
  FormDefinition,
  GroupElement,
  PageDefinition,
  TextElement,
} from './form.model';

const COPY_SUFFIX = '(copy)';

function text(label: string): TextElement {
  return createElement('text', label) as TextElement;
}

function conditions(fieldId: string): ConditionGroup {
  return {
    logic: 'all',
    conditions: [{ fieldId, operator: 'isNotEmpty' }],
    groups: [],
  };
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

describe('cloneElement', () => {
  it('returns null for an unknown element', () => {
    expect(cloneElement(newForm('Demo'), 'missing', COPY_SUFFIX)).toBeNull();
  });

  it('clones a group with fresh ids and remaps references inside the subtree', () => {
    const form = newForm('Demo');
    const { page, group } = pageWithNestedDeps(form);
    form.pages = [page];

    const clone = cloneElement(form, group.id, COPY_SUFFIX);
    expect(clone).not.toBeNull();

    const copiedGroup = clone?.element as GroupElement;
    const [copiedFirst, copiedSecond, copiedThird] = clone?.subtree as TextElement[];

    expect(copiedGroup.id).not.toBe(group.id);
    expect(copiedGroup.label).toBe('Group (copy)');
    expect(clone!.subtree.map((el) => el.label)).toEqual(
      group.children.map((id) => form.elements[id].label),
    );
    expect(copiedGroup.children).toEqual([copiedFirst.id, copiedSecond.id, copiedThird.id]);
    expect(new Set([copiedGroup.id, ...clone!.subtree.map((el) => el.id)]).size).toBe(4);

    expect(copiedSecond.defaultValue).toEqual({ kind: 'fromField', fieldId: copiedFirst.id });
    const condition = copiedThird.enabledWhen?.conditions[0];
    expect(condition?.fieldId).toBe(copiedSecond.id);
    expect(condition?.operand).toEqual({ kind: 'field', fieldId: copiedFirst.id });
    expect(condition?.operandTo).toEqual({ kind: 'field', fieldId: copiedFirst.id });
  });

  it('leaves references to elements outside the cloned subtree untouched', () => {
    const form = newForm('Demo');
    const { page, group } = pageWithNestedDeps(form);
    form.pages = [page];
    const firstId = group.children[0];

    const clone = cloneElement(form, getElements(page, form)[1].id, COPY_SUFFIX);

    expect((clone?.element as TextElement).defaultValue).toEqual({
      kind: 'fromField',
      fieldId: firstId,
    });
    expect((clone?.element as TextElement).enabledWhen?.conditions[0].fieldId).toBe(firstId);
  });

  it('gives copied choice options fresh ids', () => {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const choice = createElement('choice', 'Pick') as ChoiceElement;
    addToGroup(choice, page, form);
    form.pages = [page];

    const clone = cloneElement(form, choice.id, COPY_SUFFIX)?.element as ChoiceElement;

    expect(clone.options).toHaveLength(choice.options.length);
    expect(clone.options.map((o) => o.id)).not.toEqual(choice.options.map((o) => o.id));
  });

  it('remaps static defaults and condition values that select a copied option', () => {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const group = createElement('group', 'Group');
    const multi = createElement('multiChoice', 'Pick') as ChoiceElement;
    const [a, b] = multi.options.map((o) => o.id);
    multi.defaultValue = { kind: 'static', value: [a, 'unknown'] };
    const dependent = text('Dependent');
    dependent.enabledWhen = {
      logic: 'all',
      conditions: [
        { fieldId: multi.id, operator: 'eq', operand: { kind: 'literal', value: b } },
        { fieldId: multi.id, operator: 'hasAnyOf', values: [a, b] },
      ],
      groups: [],
    };
    addToGroup([multi, dependent], group, form);
    addToGroup(group, page, form);
    form.pages = [page];

    const clone = cloneElement(form, group.id, COPY_SUFFIX);
    const [copiedMulti, copiedDependent] = clone?.subtree as [ChoiceElement, TextElement];
    const [newA, newB] = copiedMulti.options.map((o) => o.id);

    expect(copiedMulti.defaultValue).toEqual({ kind: 'static', value: [newA, 'unknown'] });
    const [eq, anyOf] = copiedDependent.enabledWhen!.conditions;
    expect(eq.operand).toEqual({ kind: 'literal', value: newB });
    expect(anyOf.values).toEqual([newA, newB]);
    expect(multi.defaultValue).toEqual({ kind: 'static', value: [a, 'unknown'] });
  });

  it('leaves condition values on choices outside the clone untouched', () => {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const choice = createElement('choice', 'Pick') as ChoiceElement;
    const optionId = choice.options[0].id;
    const dependent = text('Dependent');
    dependent.enabledWhen = {
      logic: 'all',
      conditions: [
        { fieldId: choice.id, operator: 'eq', operand: { kind: 'literal', value: optionId } },
      ],
      groups: [],
    };
    addToGroup([choice, dependent], page, form);
    form.pages = [page];

    const clone = cloneElement(form, dependent.id, COPY_SUFFIX)?.element as TextElement;

    expect(clone.enabledWhen?.conditions[0].operand).toEqual({ kind: 'literal', value: optionId });
  });

  it('does not modify the original elements', () => {
    const form = newForm('Demo');
    const { page, group } = pageWithNestedDeps(form);
    form.pages = [page];
    const before = structuredClone(form.elements);

    cloneElement(form, group.id, COPY_SUFFIX);

    expect(form.elements).toEqual(before);
  });
});

describe('clonePage', () => {
  it('returns null for an unknown page', () => {
    expect(clonePage(newForm('Demo'), 'missing', COPY_SUFFIX)).toBeNull();
  });

  it('clones every element of the page and remaps same-page references', () => {
    const form = newForm('Demo');
    const { page, group } = pageWithNestedDeps(form);
    form.pages = [page];

    const clone = clonePage(form, page.id, COPY_SUFFIX);
    expect(clone).not.toBeNull();

    const copiedGroup = clone?.elements.find(
      (el) => el.id === clone.page.children[0],
    ) as GroupElement;
    const copiedElements = new Map(clone?.elements.map((el) => [el.id, el]));
    const [copiedFirst, copiedSecond, copiedThird] = copiedGroup.children.map((id) =>
      copiedElements.get(id),
    ) as TextElement[];

    expect(clone?.page.id).not.toBe(page.id);
    expect(clone?.page.title).toBe('Page 1 (copy)');
    expect(copiedGroup.id).not.toBe(group.id);
    // Only the page title is marked as a copy, not the elements on it.
    expect(copiedGroup.label).toBe('Group');
    expect(clone!.elements.filter((el) => el.label.includes(COPY_SUFFIX))).toEqual([]);
    expect(copiedSecond.defaultValue).toEqual({ kind: 'fromField', fieldId: copiedFirst.id });
    expect(copiedThird.enabledWhen?.conditions[0].fieldId).toBe(copiedSecond.id);

    // A top-level field that refers into the group follows the copied group child.
    const copiedTop = copiedElements.get(clone!.page.children[1]) as TextElement;
    expect(copiedTop.defaultValue).toEqual({ kind: 'fromField', fieldId: copiedFirst.id });
    expect(copiedTop.enabledWhen?.conditions[0].fieldId).toBe(copiedFirst.id);
  });

  it('leaves references to elements on other pages untouched', () => {
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

    const clone = clonePage(form, target.id, COPY_SUFFIX);

    expect(clone?.page.children).toHaveLength(1);
    const copiedField = clone?.elements[0] as TextElement;
    expect(copiedField.id).not.toBe(targetField.id);
    expect(copiedField.defaultValue).toEqual({ kind: 'fromField', fieldId: sourceField.id });
    expect(copiedField.enabledWhen?.conditions[0].fieldId).toBe(sourceField.id);
  });

  it('remaps a page condition that refers to an element of the copied page', () => {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const field = text('Field');
    addToGroup(field, page, form);
    page.enabledWhen = conditions(field.id);
    form.pages = [page];

    const clone = clonePage(form, page.id, COPY_SUFFIX);

    expect(clone?.page.enabledWhen?.conditions[0].fieldId).toBe(clone?.page.children[0]);
  });
});

describe('patchElement', () => {
  function single(): { form: FormDefinition; el: TextElement } {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const el = text('Name');
    el.enabledWhen = conditions(el.id);
    addToGroup(el, page, form);
    form.pages = [page];
    return { form, el };
  }

  function defaultOf(form: FormDefinition, id: string): unknown {
    const el = form.elements[id];
    return 'defaultValue' in el ? el.defaultValue : undefined;
  }

  const fromField = (fieldId: string) => ({ kind: 'fromField' as const, fieldId });

  it('replaces the patched fields and leaves the input untouched', () => {
    const { form, el } = single();

    const next = patchElement(form, el.id, { label: 'Full name', required: true });

    expect(next.elements[el.id]).toMatchObject({ label: 'Full name', required: true });
    expect(form.elements[el.id].label).toBe('Name');
  });

  it('removes a field set to null but keeps a null default value', () => {
    const { form, el } = single();
    const withDefault = patchElement(form, el.id, {
      defaultValue: { kind: 'static', value: 'x' },
    });

    const next = patchElement(withDefault, el.id, { enabledWhen: null, defaultValue: null });

    expect(next.elements[el.id]).not.toHaveProperty('enabledWhen');
    expect(defaultOf(next, el.id)).toBeNull();
  });

  it('returns the input for an unknown element', () => {
    const { form } = single();
    expect(patchElement(form, 'gone', { label: 'x' })).toBe(form);
  });

  it('pairs the children of a group copying from another group, recursively', () => {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const source = createElement('group', 'Source') as GroupElement;
    const target = createElement('group', 'Target') as GroupElement;
    const sourceInner = createElement('group', 'Source inner') as GroupElement;
    const targetInner = createElement('group', 'Target inner') as GroupElement;
    const [a, b, deep] = [text('A'), text('B'), text('Deep')];
    const [x, y, z, deepCopy] = [text('X'), text('Y'), text('Z'), text('Deep copy')];
    addToGroup(deep, sourceInner, form);
    addToGroup(deepCopy, targetInner, form);
    addToGroup([a, sourceInner, b], source, form);
    // The target has one child more than the source: that one keeps its default.
    addToGroup([x, targetInner, y, z], target, form);
    addToGroup([source, target], page, form);
    form.pages = [page];

    const next = patchElement(form, target.id, { defaultValue: fromField(source.id) });

    expect(defaultOf(next, target.id)).toEqual(fromField(source.id));
    expect(defaultOf(next, x.id)).toEqual(fromField(a.id));
    expect(defaultOf(next, targetInner.id)).toEqual(fromField(sourceInner.id));
    expect(defaultOf(next, deepCopy.id)).toEqual(fromField(deep.id));
    expect(defaultOf(next, y.id)).toEqual(fromField(b.id));
    expect(defaultOf(next, z.id)).toBeNull();
    expect(getElements(target, next).map((e) => e.id)).toEqual([x.id, targetInner.id, y.id, z.id]);
  });

  it('pairs no children when the source is not a group', () => {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const group = createElement('group', 'Group') as GroupElement;
    const [child, other] = [text('Child'), text('Other')];
    addToGroup(child, group, form);
    addToGroup([group, other], page, form);
    form.pages = [page];

    const next = patchElement(form, group.id, { defaultValue: fromField(other.id) });

    expect(defaultOf(next, child.id)).toBeNull();
  });
});

describe('moveOptionTo', () => {
  function withChoice(): { form: FormDefinition; choice: ChoiceElement } {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const choice = createElement('choice', 'Pick') as ChoiceElement;
    choice.options = ['A', 'B', 'C'].map((label) => ({ id: label.toLowerCase(), label }));
    addToGroup(choice, page, form);
    form.pages = [page];
    return { form, choice };
  }

  const ids = (form: FormDefinition, id: string) =>
    (form.elements[id] as ChoiceElement).options.map((o) => o.id);

  it('moves an option to the index counted after taking it out', () => {
    const { form, choice } = withChoice();

    expect(ids(moveOptionTo(form, choice.id, 'a', 2)!, choice.id)).toEqual(['b', 'c', 'a']);
    expect(ids(moveOptionTo(form, choice.id, 'c', 0)!, choice.id)).toEqual(['c', 'a', 'b']);
    expect(ids(form, choice.id)).toEqual(['a', 'b', 'c']);
  });

  it('clamps an index past the end', () => {
    const { form, choice } = withChoice();

    expect(ids(moveOptionTo(form, choice.id, 'a', 9)!, choice.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns null for an unknown element or option', () => {
    const { form, choice } = withChoice();

    expect(moveOptionTo(form, 'gone', 'a', 0)).toBeNull();
    expect(moveOptionTo(form, choice.id, 'gone', 0)).toBeNull();
  });
});

describe('patchPage', () => {
  function withPage(): { form: FormDefinition; page: PageDefinition } {
    const form = newForm('Demo');
    const page = createPage('Page 1');
    const el = text('Name');
    page.enabledWhen = conditions(el.id);
    addToGroup(el, page, form);
    form.pages = [page];
    return { form, page };
  }

  it('replaces the patched fields and leaves the input untouched', () => {
    const { form, page } = withPage();

    const next = patchPage(form, page.id, { title: 'Contact', subtitle: 'How to reach you' });

    expect(next.pages[0]).toMatchObject({ title: 'Contact', subtitle: 'How to reach you' });
    expect(next.pages[0].enabledWhen).toEqual(page.enabledWhen);
    expect(form.pages[0].title).toBe('Page 1');
  });

  it('removes the condition set to null', () => {
    const { form, page } = withPage();

    expect(patchPage(form, page.id, { enabledWhen: null }).pages[0]).not.toHaveProperty(
      'enabledWhen',
    );
  });

  it('returns the input for an unknown page', () => {
    const { form } = withPage();
    expect(patchPage(form, 'gone', { title: 'x' })).toBe(form);
  });
});
