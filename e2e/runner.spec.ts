import { test, expect } from './fixtures';
import { createForm, deleteForm, loginApi, makeForm, seedField, uniqueName, uuid } from './helpers';

test('fills a multi-page form from its public share link and stores the submission', async ({
  page,
  request,
}) => {
  const formName = uniqueName('runner');
  const nameId = uuid();
  const ageId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(formName, [
      { title: 'About you', elements: [seedField('text', nameId, 'Name')] },
      { title: 'Details', elements: [seedField('number', ageId, 'Age')] },
    ]),
  );

  // The runner is public: no login/session needed.
  await page.goto(`/runner/${formId}`);
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  await expect(page.getByText('1 of 2')).toBeVisible();

  await page.getByLabel('Name').fill('Grace Hopper');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
  await expect(page.getByText('2 of 2')).toBeVisible();
  await page.getByLabel('Age').fill('42');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible();

  // The submission landed on the server.
  const res = await session.request.get(`/api/forms/${formId}/submissions`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(res.ok()).toBeTruthy();
  const subs = (await res.json()) as Array<{ values: Record<string, unknown> }>;
  expect(subs).toHaveLength(1);
  expect(subs[0].values).toMatchObject({ [nameId]: 'Grace Hopper', [ageId]: 42 });

  await deleteForm(session, formId);
});
