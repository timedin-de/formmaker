import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Editor password; matches `DEFAULT_PASSWORD` in src/server/auth.ts. */
export const PASSWORD = 'formmaker';

export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

export function uuid(): string {
  return crypto.randomUUID();
}

/** Sign in through the UI (also covers the guard > login redirect). */
export async function login(page: Page, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === '/');
}

export interface ApiSession {
  request: APIRequestContext;
  token: string;
}

/** Obtain an editor token over the API. */
export async function loginApi(request: APIRequestContext): Promise<ApiSession> {
  const res = await request.post('/api/auth/login', { data: { password: PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { token?: string };
  expect(body.token).toBeTruthy();
  return { request, token: body.token as string };
}

function editorHeaders(session: ApiSession): Record<string, string> {
  return { Authorization: `Bearer ${session.token}` };
}

export async function createForm(session: ApiSession, form: unknown): Promise<string> {
  const res = await session.request.post('/api/forms', {
    headers: editorHeaders(session),
    data: form,
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { id?: string };
  expect(body.id).toBeTruthy();
  return body.id as string;
}

export async function deleteForm(session: ApiSession, formId: string): Promise<void> {
  await session.request.delete(`/api/forms/${formId}`, { headers: editorHeaders(session) });
  await session.request.delete(`/api/forms/${formId}/submissions`, {
    headers: editorHeaders(session),
  });
}

const EMPTY_GROUP = { logic: 'all', conditions: [], groups: [] } as const;

export interface SeedPage {
  title: string;
  subtitle?: string;
  elements: Record<string, unknown>[];
}

/** Minimal but valid FormDefinition payload for POST /api/forms. */
export function makeForm(name: string, pages: SeedPage[]): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    name,
    description: '',
    version: 1,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    settings: {
      submitLabel: 'Submit',
      showProgress: true,
      allowBack: true,
      navigation: 'auto',
      enableAutoSave: true,
    },
    pages: pages.map((page) => ({
      id: uuid(),
      title: page.title,
      subtitle: page.subtitle ?? '',
      enabledWhen: EMPTY_GROUP,
      elements: page.elements,
    })),
  };
}

export function seedField(type: string, id: string, label: string): Record<string, unknown> {
  return {
    id,
    type,
    label,
    width: 1,
    enabledWhen: EMPTY_GROUP,
    ...(type === 'text' ? { inputType: 'text', maxLength: 255 } : {}),
  };
}
