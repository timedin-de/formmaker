import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Editor password; matches `DEFAULT_PASSWORD` in src/server/auth.ts. */
export const USERNAME = 'admin@formmaker.local';
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
  await page.getByLabel('Email address', { exact: true }).fill(USERNAME);

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
  const res = await request.post('/api/auth/login', {
    data: { email: USERNAME, password: PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { token?: string };
  expect(body.token).toBeTruthy();
  return { request, token: body.token as string };
}

function editorHeaders(session: ApiSession): Record<string, string> {
  return { Authorization: `Bearer ${session.token}` };
}

export async function createForm(session: ApiSession, form: unknown): Promise<string> {
  const res = await session.request.post('/api/forms/import', {
    headers: editorHeaders(session),
    data: form,
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { id?: string };
  expect(body.id).toBeTruthy();
  return body.id as string;
}

/** An element of a stored form; type-specific props stay `unknown` unless typed below. */
export interface StoredElement {
  id: string;
  label: string;
  children?: string[];
  options?: { id: string; label: string }[];
  defaultValue?: unknown;
  enabledWhen?: unknown;
  [key: string]: unknown;
}

/** Structural view of a stored form, enough to assert element order and references. */
export interface StoredForm {
  pages: { id: string; children: string[] }[];
  elements: Record<string, StoredElement>;
}

export async function getForm(session: ApiSession, formId: string): Promise<StoredForm> {
  const res = await session.request.get(`/api/forms/${formId}`, {
    headers: editorHeaders(session),
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as StoredForm;
}

export async function deleteForm(session: ApiSession, formId: string): Promise<void> {
  await session.request.delete(`/api/forms/${formId}`, { headers: editorHeaders(session) });
  await session.request.delete(`/api/forms/${formId}/submissions`, {
    headers: editorHeaders(session),
  });
}

const EMPTY_GROUP = { logic: 'all', conditions: [], groups: [] } as const;

export type SeedElement = Record<string, unknown> & { id: string };

/** A single-condition group that is satisfied when `fieldId` equals `value`. */
export function showWhen(fieldId: string, value: string): Record<string, unknown> {
  return {
    logic: 'all',
    conditions: [{ fieldId, operator: 'eq', operand: { kind: 'literal', value } }],
    groups: [],
  };
}

export interface SeedPage {
  title: string;
  subtitle?: string;
  children: string[];
}

/**
 * Minimal but valid FormDefinition payload for POST /api/forms. Pages and groups reference
 * their children by id; `elements` holds every element of the form.
 */
export function makeForm(
  name: string,
  pages: SeedPage[],
  elements: SeedElement[] = [],
): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    name,
    description: '',
    version: 1,
    schemaVersion: 2,
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
      children: page.children,
    })),
    elements: Object.fromEntries(elements.map((el) => [el.id, el])),
  };
}

export function seedField(type: string, id: string, label: string): SeedElement {
  return {
    id,
    type,
    label,
    width: 1,
    enabledWhen: EMPTY_GROUP,
    ...(type === 'text' ? { inputType: 'text' } : {}),
  };
}

export function seedGroup(id: string, label: string, children: string[]): SeedElement {
  return {
    id,
    type: 'group',
    label,
    width: 1,
    enabledWhen: EMPTY_GROUP,
    children,
  };
}
