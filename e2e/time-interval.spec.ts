import { expect, test, type Page } from './fixtures';
import { deleteForm, login, loginApi, uniqueName } from './helpers';

async function addField(page: Page, paletteLabel: string): Promise<void> {
  await page.getByRole('tab', { name: 'Basic' }).click();
  await page
    .locator('.palette .mat-mdc-tab-body-active .field-btn')
    .filter({ hasText: paletteLabel })
    .click();
}

test('configures the time interval in the designer and applies it as picker step', async ({
  page,
  request,
}) => {
  const formName = uniqueName('time-interval');
  await login(page);
  await page.getByRole('button', { name: 'New form' }).first().click();
  await page.waitForURL(/\/builder/);
  await page.getByLabel('Form name').fill(formName);

  await addField(page, 'Time picker');
  const row = page.locator('.canvas .row-wrap .row');
  await expect(row).toHaveCount(1);
  await row.click();

  // New time fields start at a one minute interval.
  await expect(page.getByLabel('Every')).toHaveValue('1');
  await expect(page.getByLabel('Unit')).toContainText('Minute');

  await page.getByLabel('Every').fill('15');
  await page.getByLabel('Unit').click();
  await page.getByRole('option', { name: 'Seconds' }).click();

  // Preview saves the form and opens the public runner with the matching step (15 × 1s).
  await Promise.all([
    page.waitForURL(/\/runner\//),
    page.getByRole('button', { name: 'Preview' }).click(),
  ]);
  const formId = page.url().split('/').pop() ?? '';
  await expect(page.locator('input[type="time"]')).toHaveAttribute('step', '15');

  // Reopening the form from the list keeps the setting.
  await page.goto('/');
  const card = page.locator('.card').filter({ hasText: formName });
  await card.getByRole('button', { name: 'Edit' }).click();
  await page.waitForURL(/\?id=/);
  await expect(page.locator('.canvas .row-wrap .row')).toHaveCount(1);
  await page.locator('.canvas .row-wrap .row').click();
  await expect(page.getByLabel('Every')).toHaveValue('15');
  await expect(page.getByLabel('Unit')).toContainText('Seconds');

  await deleteForm(await loginApi(request), formId);
});
