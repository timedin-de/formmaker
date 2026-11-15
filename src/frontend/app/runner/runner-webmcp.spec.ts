import { createElement, createPage } from '@shared/model/form-factory';
import type { ChoiceElement, FormDefinition } from '@shared/model/form.model';
import { addToGroup, newForm } from '@test/helper/forms';
import { beforeEach, describe, expect, it } from 'vitest';
import { RunnerStore } from '../core/state/runner.store';
import { type AgentFormState, type RunnerWebMcpHost, runnerWebMcpTools } from './runner-webmcp';

function twoPageForm() {
  const form: FormDefinition = newForm('Agent demo');
  const first = createPage('About you');
  const second = createPage('Details');
  const name = createElement('text', 'Name');
  name.required = true;
  const color = createElement('choice', 'Color') as ChoiceElement;
  const secret = createElement('text', 'Secret');
  secret.enabledWhen = {
    logic: 'all',
    conditions: [{ fieldId: name.id, operator: 'eq', operand: { kind: 'literal', value: 'x' } }],
    groups: [],
  };
  const fixed = createElement('text', 'Fixed');
  fixed.readonly = true;
  const age = createElement('number', 'Age');
  addToGroup([name, color, secret, fixed], first, form);
  addToGroup([age], second, form);
  form.pages = [first, second];
  return { form, name, color, secret, fixed, age };
}

function setup() {
  const ids = twoPageForm();
  const store = new RunnerStore();
  store.init(ids.form);
  const state = { submitted: false, changes: 0 };
  const host: RunnerWebMcpHost = {
    store,
    isSubmitted: () => state.submitted,
    showPage: (index) => store.goTo(index),
    submit: async () => {
      state.submitted = store.submit() !== null;
    },
    changed: () => state.changes++,
  };
  return { ...ids, store, state, tools: runnerWebMcpTools(host) };
}

const client = { signal: new AbortController().signal };
type Setup = ReturnType<typeof setup>;

async function getForm(t: Setup): Promise<AgentFormState> {
  return JSON.parse(String(await t.tools.getForm.execute({}, client))) as AgentFormState;
}

async function call(result: unknown): Promise<Record<string, unknown>> {
  return JSON.parse(String(await result)) as Record<string, unknown>;
}

describe('runner WebMCP tools', () => {
  let t: Setup;

  beforeEach(() => {
    localStorage.clear();
    t = setup();
  });

  it('describes visible pages and questions with their formats and options', async () => {
    const state = await getForm(t);
    expect(state).toMatchObject({ name: 'Agent demo', currentPage: 0, submitted: false });
    expect(state.pages.map((p) => p.title)).toEqual(['About you', 'Details']);
    const questions = state.pages[0].questions;
    // The conditional question is hidden until its trigger matches.
    expect(questions.map((q) => q.label)).toEqual(['Name', 'Color', 'Fixed']);
    expect(questions[0]).toMatchObject({
      id: t.name.id,
      type: 'text',
      required: true,
      value: null,
    });
    expect(questions[1].options).toEqual(
      t.color.options.map((o) => ({ id: o.id, label: o.label })),
    );
    expect(questions[2].readonly).toBe(true);
  });

  it('sets answers, reveals dependent questions and reports rejected ones', async () => {
    const res = await call(
      t.tools.setAnswers.execute(
        {
          answers: [
            { id: t.name.id, value: 'x' },
            { id: t.color.id, value: 'not-an-option' },
            { id: t.fixed.id, value: 'nope' },
            { id: 'missing', value: 'a' },
            { id: t.age.id, value: 42 },
          ],
        },
        client,
      ),
    );
    expect(res['results']).toEqual(
      expect.arrayContaining([
        { id: t.name.id, applied: true },
        { id: t.color.id, applied: true, error: 'Select a valid option' },
        { id: t.fixed.id, applied: false, error: 'This question is read-only.' },
        { id: 'missing', applied: false, error: 'No visible question with this id.' },
        { id: t.age.id, applied: true },
      ]),
    );
    expect(t.store.values()[t.age.id]).toBe(42);
    expect(t.state.changes).toBe(1);

    const state = await getForm(t);
    expect(state.pages[0].questions.map((q) => q.id)).toContain(t.secret.id);
  });

  it('rejects values that are not plain field values', async () => {
    const res = await call(
      t.tools.setAnswers.execute(
        { answers: [{ id: t.name.id, value: { evil: true } as unknown as string }] },
        client,
      ),
    );
    expect(res['results']).toEqual([
      {
        id: t.name.id,
        applied: false,
        error: 'Values must be a string, number, boolean, string array or null.',
      },
    ]);
    expect(t.store.values()[t.name.id]).toBeNull();
  });

  it('blocks moving forward past an invalid page', async () => {
    const blocked = await call(t.tools.goToPage.execute({ page: 1 }, client));
    expect(blocked['errors']).toEqual([
      expect.objectContaining({ page: 0, id: t.name.id, label: 'Name' }),
    ]);
    expect(t.store.pageIndex()).toBe(0);

    await t.tools.setAnswers.execute({ answers: [{ id: t.name.id, value: 'Ada' }] }, client);
    expect(await call(t.tools.goToPage.execute({ page: 1 }, client))).toEqual({ currentPage: 1 });
    expect(t.store.pageIndex()).toBe(1);
  });

  it('submits only a valid form and reports what is missing', async () => {
    const failed = await call(t.tools.submit.execute({}, client));
    expect(failed).toMatchObject({ submitted: false, error: 'The form has errors.' });
    expect(failed['errors']).toEqual([expect.objectContaining({ id: t.name.id })]);

    await t.tools.setAnswers.execute({ answers: [{ id: t.name.id, value: 'Ada' }] }, client);
    expect(await call(t.tools.submit.execute({}, client))).toEqual({ submitted: true });
    expect(await call(t.tools.submit.execute({}, client))).toEqual({
      error: 'The form was already submitted.',
    });
  });
});
