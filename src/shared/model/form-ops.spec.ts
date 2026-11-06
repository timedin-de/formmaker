import { addToGroup, getElements, newForm } from '@test/helper';
import { describe, expect, it } from 'vitest';
import type { ConditionGroup } from './conditions.model';
import { createElement, createPage } from './form-factory';
import { cloneElement, clonePage } from './form-ops';
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
    expect(copiedGroup.label).toBe('Group (copy)');
    expect(copiedSecond.defaultValue).toEqual({ kind: 'fromField', fieldId: copiedFirst.id });
    expect(copiedThird.enabledWhen?.conditions[0].fieldId).toBe(copiedSecond.id);
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
