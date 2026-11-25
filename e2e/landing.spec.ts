import { expect, test } from './fixtures';
import {
  addSubmission,
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

  await deleteForm(session, formId);
});

test('the builder without a form goes to the list and creates none', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('navigation').getByRole('link')).toHaveText(['Forms', 'Account']);
  const creates: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname.startsWith('/api/forms')) {
      creates.push(req.url());
    }
  });

  for (const url of ['/builder', '/builder', '/builder?new=1']) {
    await page.goto(url);
    await expect(page.getByRole('button', { name: 'New form' }).first()).toBeVisible();
  }

  expect(creates).toEqual([]);
});

async function formStatus(session: ApiSession, formId: string): Promise<number> {
  const res = await session.request.get(`/api/forms/${formId}`);
  return res.status();
}

test('deletes a form without submissions only after confirming', async ({ page, request }) => {
  const formName = uniqueName('delete-empty');
  const session = await loginApi(request);
  const formId = await createForm(session, makeForm(formName, []));

  await login(page);
  const card = page.locator('.card').filter({ hasText: formName });
  await card.getByRole('button', { name: 'Delete' }).click();

  const dialog = page.getByRole('alertdialog', { name: 'Delete form?' });
  await expect(dialog).toContainText('its 0 submission(s)');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(dialog.getByRole('textbox')).toHaveCount(0);

  // Cancel keeps the form.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toBeVisible();
  expect(await formStatus(session, formId)).toBe(200);

  // Escape does too.
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await formStatus(session, formId)).toBe(200);

  await card.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete form' }).click();
  await expect(card).toBeHidden();
  expect(await formStatus(session, formId)).toBe(404);
});

test('deleting a form with submissions needs the confirm word', async ({ page, request }) => {
  const formName = uniqueName('delete-filled');
  const session = await loginApi(request);
  const formId = await createForm(session, makeForm(formName, []));
  await addSubmission(session, formId, {});
  await addSubmission(session, formId, {});

  try {
    await login(page);
    const card = page.locator('.card').filter({ hasText: formName });
    await card.getByRole('button', { name: 'Delete' }).click();

    const dialog = page.getByRole('alertdialog', { name: 'Delete form?' });
    await expect(dialog).toContainText('its 2 submission(s)');
    const confirm = dialog.getByRole('button', { name: 'Delete form' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Type "DELETE" to confirm').fill('DELETE');
    await confirm.click();

    await expect(card).toBeHidden();
    expect(await formStatus(session, formId)).toBe(404);
  } finally {
    await deleteForm(session, formId);
  }
});
