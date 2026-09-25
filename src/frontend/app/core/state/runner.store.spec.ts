import { describe, expect, it, beforeEach } from 'vitest';
import { RunnerStore } from './runner.store';
import { newForm, createElement, createPage } from './form-factory';
import type { FormDefinition } from '@shared/model/form.model';

function draftForm(): FormDefinition {
  const form = newForm('Draft Demo');
  const page = createPage('Details');
  const name = createElement('text', 'Full name');
  const age = createElement('number', 'Age');
  page.elements = [name, age];
  form.pages = [page];
  return form;
}

describe('RunnerStore draft persistence', () => {
  let store: RunnerStore;

  beforeEach(() => {
    localStorage.clear();
    store = new RunnerStore();
  });

  it('does not flag a restored draft when none exists', () => {
    const form = draftForm();
    store.init(form);
    expect(store.restoredDraft()).toBe(false);
  });

  it('autosaves values and restores them on a fresh init', () => {
    const form = draftForm();
    store.init(form);
    const [nameEl, ageEl] = form.pages[0].elements;

    store.setAnswer(nameEl.id, 'Ada');
    store.setAnswer(ageEl.id, 36);
    store.saveDraft();

    const reloaded = new RunnerStore();
    reloaded.init(form);
    expect(reloaded.restoredDraft()).toBe(true);
    const restored = reloaded.answers.get(nameEl.id);
    const restoredAge = reloaded.answers.get(ageEl.id);
    expect(restored?.value).toBe('Ada');
    expect(restoredAge?.value).toBe(36);
  });

  it('discards a stale draft when the form version changed', () => {
    const form = draftForm();
    store.init(form);
    const [nameEl] = form.pages[0].elements;
    store.setAnswer(nameEl.id, 'Ada');
    store.saveDraft();

    form.version += 1;
    const reloaded = new RunnerStore();
    reloaded.init(form);
    expect(reloaded.restoredDraft()).toBe(false);
    expect(reloaded.answers.get(nameEl.id)?.value).toBeNull();
  });

  it('clears the draft on submit', () => {
    const form = draftForm();
    store.init(form);
    const [nameEl, ageEl] = form.pages[0].elements;

    store.setAnswer(nameEl.id, 'Ada');
    store.setAnswer(ageEl.id, 36);
    store.submit();

    expect(localStorage.getItem(`formmaker.draft.${form.id}`)).toBeNull();
  });

  it('clears the draft on reset', () => {
    const form = draftForm();
    store.init(form);
    const [nameEl] = form.pages[0].elements;

    store.setAnswer(nameEl.id, 'Ada');
    store.reset();

    expect(localStorage.getItem(`formmaker.draft.${form.id}`)).toBeNull();
  });

  it('ignores corrupted draft data', () => {
    const form = draftForm();
    localStorage.setItem(`formmaker.draft.${form.id}`, 'not json {');

    const reloaded = new RunnerStore();
    reloaded.init(form);
    expect(reloaded.restoredDraft()).toBe(false);
  });
});

describe('RunnerStore submission', () => {
  it('includes values of fields nested inside groups', () => {
    const form = newForm('Grouped');
    const page = createPage('Details');
    const name = createElement('text', 'Full name');
    const member1 = createElement('text', 'Member 1');
    const member2 = createElement('text', 'Member 2');
    const group = createElement('group', 'Team') as unknown as {
      type: 'group';
      elements: ReturnType<typeof createElement>[];
    };
    group.elements = [member1, member2];
    page.elements = [name, group as never];
    form.pages = [page];

    const store = new RunnerStore();
    store.init(form);
    store.setAnswer(name.id, 'Ada');
    store.setAnswer(member1.id, 'Sam');
    store.setAnswer(member2.id, 'Jo');

    const result = store.submit();
    expect(result?.submission.values).toMatchObject({
      [name.id]: 'Ada',
      [member1.id]: 'Sam',
      [member2.id]: 'Jo',
    });
    expect(result?.visibleAnswerKeys).toContain(member1.id);
    expect(result?.visibleAnswerKeys).toContain(member2.id);
  });

  it('does not require hidden fields', () => {
    const form = newForm('Conditional');
    const page = createPage('Details');
    const trigger = createElement('text', 'Trigger');
    const conditional = createElement('text', 'Conditional');
    conditional.required = true;
    conditional.enabledWhen = {
      logic: 'all',
      conditions: [
        { fieldId: trigger.id, operator: 'eq', operand: { kind: 'literal', value: 'yes' } },
      ],
      groups: [],
    };
    page.elements = [trigger, conditional];
    form.pages = [page];

    const store = new RunnerStore();
    store.init(form);

    expect(store.submit()).not.toBeNull();

    store.setAnswer(trigger.id, 'yes');
    expect(store.submit()).toBeNull();

    store.setAnswer(conditional.id, 'filled');
    expect(store.submit()).not.toBeNull();
  });

  it('does not require fields that were touched while visible but are now hidden', () => {
    const form = newForm('Conditional');
    const page = createPage('Details');
    const trigger = createElement('text', 'Trigger');
    const conditional = createElement('text', 'Conditional');
    conditional.required = true;
    conditional.enabledWhen = {
      logic: 'all',
      conditions: [
        { fieldId: trigger.id, operator: 'eq', operand: { kind: 'literal', value: 'yes' } },
      ],
      groups: [],
    };
    page.elements = [trigger, conditional];
    form.pages = [page];

    const store = new RunnerStore();
    store.init(form);

    store.setAnswer(trigger.id, 'yes');
    store.answers.get(conditional.id)?.markAsTouched();
    expect(store.answers.get(conditional.id)?.touched).toBe(true);
    expect(store.submit()).toBeNull();

    store.setAnswer(trigger.id, '');
    expect(store.submit()).not.toBeNull();
  });

  it('enforces required fields nested inside groups', () => {
    const form = newForm('Grouped');
    const page = createPage('Details');
    const member = createElement('text', 'Member');
    member.required = true;
    const group = createElement('group', 'Team');
    group.elements = [member];
    page.elements = [group];
    form.pages = [page];

    const store = new RunnerStore();
    store.init(form);

    expect(store.submit()).toBeNull();

    store.setAnswer(member.id, 'Sam');
    expect(store.submit()).not.toBeNull();
  });

  it('does not require fields hidden inside groups', () => {
    const form = newForm('Grouped Conditional');
    const page = createPage('Details');
    const trigger = createElement('text', 'Trigger');
    const member = createElement('text', 'Member');
    member.required = true;
    member.enabledWhen = {
      logic: 'all',
      conditions: [
        { fieldId: trigger.id, operator: 'eq', operand: { kind: 'literal', value: 'yes' } },
      ],
      groups: [],
    };
    const group = createElement('group', 'Team');
    group.elements = [member];
    page.elements = [trigger, group];
    form.pages = [page];

    const store = new RunnerStore();
    store.init(form);

    expect(store.submit()).not.toBeNull();

    store.setAnswer(trigger.id, 'yes');
    expect(store.submit()).toBeNull();

    store.setAnswer(member.id, 'Sam');
    expect(store.submit()).not.toBeNull();
  });
});
