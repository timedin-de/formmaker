import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  createForm,
  deleteForm,
  getForm,
  login,
  loginApi,
  makeForm,
  seedField,
  uniqueName,
  uuid,
} from './helpers';

async function selectRow(page: Page, label: string): Promise<void> {
  await page
    .locator('.row-select', { has: page.locator('.name', { hasText: new RegExp(`^${label}$`) }) })
    .click();
}

test('keeps a failed edit, offers a backup and sends it again on request', async ({
  page,
  request,
}) => {
  const nameId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(
      uniqueName('unsaved-edits'),
      [{ title: 'Details', children: [nameId] }],
      [seedField('text', nameId, 'Name')],
    ),
  );
  try {
    await login(page);
    await page.goto(`/builder?id=${formId}`);

    // The server rejects the edit, so it is not retried on its own.
    const elementUrl = `**/api/forms/${formId}/elements/${nameId}`;
    await page.route(elementUrl, (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 400, json: { error: 'rejected' } })
        : route.fallback(),
    );
    await selectRow(page, 'Name');
    await page.getByLabel('Label').fill('Full name');

    // Preview sends the edit at once and stays in the builder when it fails.
    await page.getByRole('button', { name: 'Preview' }).click();
    const banner = page.getByRole('alert').filter({ hasText: 'Some changes are not saved' });
    await expect(banner).toBeVisible();
    await expect(page).toHaveURL(/\/builder/);

    // The backup holds the form as shown, edit included.
    const [backup] = await Promise.all([
      page.waitForEvent('download'),
      banner.getByRole('button', { name: 'Download backup' }).click(),
    ]);
    const saved = JSON.parse(readFileSync(await backup.path(), 'utf8')) as {
      elements: Record<string, { label: string }>;
    };
    expect(saved.elements[nameId].label).toBe('Full name');

    await page.unroute(elementUrl);
    await banner.getByRole('button', { name: 'Try again' }).click();
    await expect(banner).toBeHidden();
    await expect
      .poll(async () => (await getForm(session, formId)).elements[nameId].label)
      .toBe('Full name');
  } finally {
    await deleteForm(session, formId);
  }
});
