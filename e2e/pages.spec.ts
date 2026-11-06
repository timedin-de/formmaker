import { expect, test } from './fixtures';
import { createForm, deleteForm, getForm, login, loginApi, makeForm, uniqueName } from './helpers';

test('duplicates a page and switches to the copy', async ({ page, request }) => {
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(uniqueName('duplicate-page'), [{ title: 'Details', children: [] }]),
  );

  await login(page);
  await page.goto(`/builder?id=${formId}`);
  await expect(page.locator('.page-name[aria-current="page"]')).toHaveText('Details');

  await page.getByRole('button', { name: 'Duplicate Page' }).click();

  // The server persists the copy; its id is the only page id besides the original.
  await expect
    .poll(async () => ((await getForm(session, formId)).pages as unknown[]).length)
    .toBe(2);
  const stored = (await getForm(session, formId)).pages as unknown as { id: string }[];
  const copyId = stored[1].id;

  await expect(page).toHaveURL(new RegExp(`[?&]page=${copyId}(&|$)`));
  await expect(page.locator('.page-name[aria-current="page"]')).toHaveText('Details (copy)');

  await deleteForm(session, formId);
});
