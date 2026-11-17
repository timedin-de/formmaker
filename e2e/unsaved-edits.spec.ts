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

    // Leaving the builder asks first, and staying keeps the edit.
    await page.getByRole('link', { name: 'Forms' }).click();
    const leave = page.getByRole('dialog', { name: 'Leave the form?' });
    await expect(leave).toBeVisible();
    await leave.getByRole('button', { name: 'Stay' }).click();
    await expect(leave).toBeHidden();
    await expect(page).toHaveURL(/\/builder/);

    await page.unroute(elementUrl);
    await banner.getByRole('button', { name: 'Try again' }).click();
    await expect(banner).toBeHidden();
    await expect
      .poll(async () => (await getForm(session, formId)).elements[nameId].label)
      .toBe('Full name');

    // With everything saved, leaving needs no answer.
    await page.getByRole('link', { name: 'Forms' }).click();
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await deleteForm(session, formId);
  }
});

test('sends a waiting edit when leaving right after it and asks once it fails', async ({
  page,
  request,
}) => {
  const nameId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(
      uniqueName('unsaved-leave'),
      [{ title: 'Details', children: [nameId] }],
      [seedField('text', nameId, 'Name')],
    ),
  );
  try {
    // The page's clock runs as usual until it is paused below.
    await page.clock.install();
    await login(page);
    await page.goto(`/builder?id=${formId}`);
    let patches = 0;
    await page.route(`**/api/forms/${formId}/elements/${nameId}`, (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      patches++;
      return route.fulfill({ status: 400, json: { error: 'rejected' } });
    });
    await selectRow(page, 'Name');
    // Stopped before editing, so the edit's wait (`PATCH_DELAY_MS`) can't run out: only
    // leaving sends it. A bit ahead, as the page's time runs on until the pause.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.getByLabel('Label').fill('Full name');

    // Leaving before the edit's wait is over sends it, and its failure keeps the builder open.
    expect(patches).toBe(0);
    await page.getByRole('link', { name: 'Forms' }).click();
    await expect.poll(() => patches).toBe(1);
    // Sending it cleared the wait, so the clock may run again (Angular renders on timers).
    await page.clock.resume();
    const leave = page.getByRole('dialog', { name: 'Leave the form?' });
    await expect(leave).toBeVisible();
    expect(patches).toBe(1);
    await expect(page).toHaveURL(/\/builder/);
    await leave.getByRole('button', { name: 'Leave anyway' }).click();
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await deleteForm(session, formId);
  }
});
