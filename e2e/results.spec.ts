import { expect, test } from './fixtures';
import {
  addSubmission,
  countSubmissions,
  createForm,
  deleteForm,
  login,
  loginApi,
  makeForm,
  uniqueName,
  type ApiSession,
} from './helpers';

let session: ApiSession;
let formId: string;

test.beforeEach(async ({ request }) => {
  session = await loginApi(request);
  formId = await createForm(session, makeForm(uniqueName('results'), []));
  await addSubmission(session, formId, {});
  await addSubmission(session, formId, {});
});

test.afterEach(async () => {
  await deleteForm(session, formId);
});

test('deletes a submission only after confirming', async ({ page }) => {
  await login(page);
  await page.goto(`/results/${formId}`);
  const cards = page.locator('.submission-card');
  await expect(cards).toHaveCount(2);

  await cards.first().getByRole('button', { name: 'Delete submission' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete submission?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(cards).toHaveCount(2);
  expect(await countSubmissions(session, formId)).toBe(2);

  await cards.first().getByRole('button', { name: 'Delete submission' }).click();
  await dialog.getByRole('button', { name: 'Delete submission' }).click();
  await expect(cards).toHaveCount(1);
  expect(await countSubmissions(session, formId)).toBe(1);
});

test('clears all submissions only after typing the confirm word', async ({ page }) => {
  await login(page);
  await page.goto(`/results/${formId}`);
  const cards = page.locator('.submission-card');
  await expect(cards).toHaveCount(2);

  await page.getByRole('button', { name: 'Clear' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete all submissions?' });
  await expect(dialog).toContainText('All 2 submission(s)');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await countSubmissions(session, formId)).toBe(2);

  await page.getByRole('button', { name: 'Clear' }).click();
  const confirm = dialog.getByRole('button', { name: 'Delete all' });
  const word = dialog.getByLabel('Type "DELETE" to confirm');
  await word.fill('DELET');
  await expect(confirm).toBeDisabled();
  await word.fill('delete');
  await confirm.click();

  await expect(page.getByText('No submissions yet for this form.')).toBeVisible();
  expect(await countSubmissions(session, formId)).toBe(0);
});
