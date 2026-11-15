import { expect, test } from './fixtures';
import { createForm, deleteForm, loginApi, makeForm, seedField, uniqueName, uuid } from './helpers';

/**
 * Browsers without WebMCP get a minimal `document.modelContext` stand-in that
 * records registered tools, so the runner's tools can be driven like an agent would.
 */
async function stubModelContext(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    interface StubTool {
      name: string;
      execute: (args: unknown, client: { signal: AbortSignal }) => unknown;
    }
    const tools = new Map<string, StubTool>();
    const modelContext = {
      registerTool: async (tool: StubTool, options?: { signal?: AbortSignal }) => {
        tools.set(tool.name, tool);
        options?.signal?.addEventListener('abort', () => tools.delete(tool.name));
      },
    };
    Object.defineProperty(document, 'modelContext', { value: modelContext, configurable: true });
    Object.assign(window, {
      __webmcp: {
        names: () => [...tools.keys()].sort(),
        call: async (name: string, args: unknown) => {
          const tool = tools.get(name);
          if (!tool) throw new Error(`No tool ${name}`);
          return JSON.parse(
            String(await tool.execute(args, { signal: new AbortController().signal })),
          ) as unknown;
        },
      },
    });
  });
}

type Agent = { names(): string[]; call(name: string, args: unknown): Promise<unknown> };

test('an agent fills and submits a form through the runner WebMCP tools', async ({
  page,
  request,
}) => {
  const nameId = uuid();
  const ageId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(
      uniqueName('webmcp'),
      [
        { title: 'About you', children: [nameId] },
        { title: 'Details', children: [ageId] },
      ],
      [{ ...seedField('text', nameId, 'Name'), required: true }, seedField('number', ageId, 'Age')],
    ),
  );

  await stubModelContext(page);
  await page.goto(`/runner/${formId}`);
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();

  const call = (name: string, args: unknown = {}) =>
    page.evaluate(
      ([n, a]) => (window as unknown as { __webmcp: Agent }).__webmcp.call(n as string, a),
      [name, args] as const,
    );

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __webmcp: Agent }).__webmcp.names()))
    .toEqual([
      'formmaker_get_form',
      'formmaker_go_to_page',
      'formmaker_set_answers',
      'formmaker_submit',
    ]);

  const state = (await call('formmaker_get_form')) as {
    pages: { questions: { id: string; label: string }[] }[];
  };
  expect(state.pages.flatMap((p) => p.questions.map((q) => q.label))).toEqual(['Name', 'Age']);

  // Submitting too early reports the missing answer and shows it in the UI.
  expect(await call('formmaker_submit')).toMatchObject({ submitted: false });
  await expect(page.getByText('This field is required')).toBeVisible();

  await call('formmaker_set_answers', {
    answers: [
      { id: nameId, value: 'Grace Hopper' },
      { id: ageId, value: 42 },
    ],
  });
  await expect(page.getByLabel('Name')).toHaveValue('Grace Hopper');

  expect(await call('formmaker_go_to_page', { page: 1 })).toEqual({ currentPage: 1 });
  await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
  await expect(page.getByLabel('Age')).toHaveValue('42');

  expect(await call('formmaker_submit')).toEqual({ submitted: true });
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible();

  const res = await session.request.get(`/api/forms/${formId}/submissions`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  const subs = (await res.json()) as { values: Record<string, unknown> }[];
  expect(subs[0].values).toMatchObject({ [nameId]: 'Grace Hopper', [ageId]: 42 });

  // Leaving the runner unregisters its tools.
  await page.getByRole('button', { name: 'Back' }).first().click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __webmcp: Agent }).__webmcp.names()))
    .toEqual([]);

  await deleteForm(session, formId);
});
