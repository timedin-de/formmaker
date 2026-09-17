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
});
