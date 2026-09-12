import { expect, test, type Page } from './fixtures';
import { uniqueName, login, loginApi, deleteForm } from './helpers';

async function addField(page: Page, paletteLabel: string): Promise<void> {
  await page.getByRole('tab', { name: 'Basic' }).click();
  await page
    .locator('.palette .mat-mdc-tab-body-active .field-btn')
    .filter({ hasText: paletteLabel })
    .click();
}

test('builds a form in the designer, fills it out in the runner and exports results', async ({
  page,
  request,
}) => {
  const formName = uniqueName('journey');
  await login(page);

  // Landing → new form in the builder (blank form is created + saved on load).
  await page.getByRole('button', { name: 'New form' }).first().click();
  await page.waitForURL(/\/builder/);

  await page.getByLabel('Form name').fill(formName);
  await page.getByLabel('Page title').fill('Contact');

  // Add a short-text question and rename it via the property panel.
  await addField(page, 'Short text');
  const rows = page.locator('.canvas .row-wrap .row');
  await expect(rows).toHaveCount(1);
  await rows.click();
  await page.getByLabel('Label').fill('Your name');

  // Add a number question and rename it.
  await addField(page, 'Number');
  await expect(rows).toHaveCount(2);
  await rows.nth(1).click();
  await page.getByLabel('Label').fill('Age');

  // Preview saves and opens the public runner.
  await Promise.all([
    page.waitForURL(/\/runner\//),
    page.getByRole('button', { name: 'Preview' }).click(),
  ]);

  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByLabel('Age').fill('36');
  await page.getByRole('button', { name: 'Submit' }).click();

  // Thank-you screen with a PDF receipt download.
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible();
  const [receipt] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PDF' }).click(),
  ]);
  expect(receipt.suggestedFilename()).toMatch(/\.pdf$/);

  // Back home: the form shows up in the list.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  const card = page.locator('.card').filter({ hasText: formName });
  await expect(card).toBeVisible();

  // Results: the submission is listed with its values.
  await card.getByRole('button', { name: 'Results' }).click();
  await page.waitForURL(/\/results\//);
  await expect(page.getByText('Ada Lovelace')).toBeVisible();
  await expect(page.getByText('36')).toBeVisible();

  const formId = page.url().split('/').pop() ?? '';

  // Pluggable export channels: CSV + PDF downloads.
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV' }).click(),
  ]);
  expect(csv.suggestedFilename()).toBe(`${formName}-responses.csv`);

  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PDF' }).click(),
  ]);
  expect(pdf.suggestedFilename()).toBe(`${formName}-responses.pdf`);

  await deleteForm(await loginApi(request), formId);
});
