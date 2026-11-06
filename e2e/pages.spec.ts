import { expect, test } from './fixtures';
import {
  createForm,
  deleteForm,
  getForm,
  login,
  loginApi,
  makeForm,
  seedField,
  seedGroup,
  uniqueName,
  uuid,
} from './helpers';

test('duplicates a group and only marks the copied group itself', async ({ page, request }) => {
  const session = await loginApi(request);
  const groupId = uuid();
  const child = seedField('text', uuid(), 'Street');
  const formId = await createForm(
    session,
    makeForm(
      uniqueName('duplicate-group'),
      [{ title: 'Details', children: [groupId] }],
      [seedGroup(groupId, 'Address', [child.id]), child],
    ),
  );

  await login(page);
  await page.goto(`/builder?id=${formId}`);
  await page
    .locator('fm-element-row', { has: page.getByText('Address', { exact: true }) })
    .first()
    .getByRole('button', { name: 'Duplicate', exact: true })
    .first()
    .click();

  await expect
    .poll(async () =>
      Object.values((await getForm(session, formId)).elements)
        .map((el) => el.label)
        .sort(),
    )
    .toEqual(['Address', 'Address (copy)', 'Street', 'Street']);

  await deleteForm(session, formId);
});

test('duplicates a page and switches to the copy', async ({ page, request }) => {
  const session = await loginApi(request);
  const name = seedField('text', uuid(), 'Name');
  const formId = await createForm(
    session,
    makeForm(uniqueName('duplicate-page'), [{ title: 'Details', children: [name.id] }], [name]),
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
  // Only the page title is marked as a copy, not the elements on it.
  const labels = Object.values((await getForm(session, formId)).elements).map((el) => el.label);
  expect(labels.sort()).toEqual(['Name', 'Name']);

  await deleteForm(session, formId);
});
