import { test, expect } from './fixtures';
import {
  createForm,
  deleteForm,
  login,
  loginApi,
  makeForm,
  uniqueName,
  USERNAME,
  type ApiSession,
} from './helpers';

async function savedUpdatedAt(session: ApiSession, formId: string): Promise<string | undefined> {
  const res = await session.request.get(`/api/forms/${formId}`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { updatedAt?: string };
  return body.updatedAt;
}

test('shows the full update time as a tooltip on the card date', async ({ page, request }) => {
  const formName = uniqueName('landing');
  const session = await loginApi(request);
  const formId = await createForm(session, makeForm(formName, []));

  // The server stamps updatedAt on save; compute what the browser renders from it.
  const stamp = (await savedUpdatedAt(session, formId)) as string;
  const expectedDate = await page.evaluate((s) => new Date(s).toLocaleDateString(), stamp);
  const expectedTime = await page.evaluate((s) => new Date(s).toLocaleTimeString(), stamp);

  await login(page);

  const card = page.locator('.card').filter({ hasText: formName });
  await expect(card).toBeVisible();

  // The card shows the date; the full time only appears on hover.
  const datestamp = card.locator('.mat-mdc-card-subtitle span');
  await expect(datestamp).toHaveText(expectedDate);
  await expect(card).not.toContainText(expectedTime);

  await datestamp.hover();
  const tooltip = page.locator('.mat-mdc-tooltip-surface');
  await expect(tooltip).toHaveText(expectedTime);

  await deleteForm(session, formId);
});

test('exposes owner data only to the authenticated catalogue and strips it from public forms', async ({
  page,
  request,
}) => {
  const formName = uniqueName('owner');
  const session = await loginApi(request);
  const formId = await createForm(session, {
    ...makeForm(formName, []),
    ownerId: 'forged-owner',
    owner: {
      id: 'forged-owner',
      email: 'forged@example.test',
      role: 'editor',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  });
  const headers = { Authorization: `Bearer ${session.token}` };

  const catalogueResponse = await session.request.get('/api/forms', { headers });
  expect(catalogueResponse.ok()).toBeTruthy();
  const catalogue = (await catalogueResponse.json()) as {
    id: string;
    ownerId?: string;
    owner?: { email: string; passwordHash?: string };
  }[];
  const item = catalogue.find((form) => form.id === formId);
  expect(item?.owner?.email).toBe(USERNAME);
  expect(item?.ownerId).not.toBe('forged-owner');
  expect(item?.owner).not.toHaveProperty('passwordHash');

  const publicResponse = await request.get(`/api/forms/${formId}`);
  expect(publicResponse.ok()).toBeTruthy();
  const publicForm = (await publicResponse.json()) as Record<string, unknown>;
  expect(publicForm).not.toHaveProperty('ownerId');
  expect(publicForm).not.toHaveProperty('owner');

  await login(page);
  const card = page.locator('.card').filter({ hasText: formName });
  await expect(card.locator('.owner-email')).toHaveText(USERNAME);

  await deleteForm(session, formId);
});
