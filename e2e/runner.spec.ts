import { expect, test } from './fixtures';
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
  const subs = (await res.json()) as { values: Record<string, unknown> }[];
  expect(subs).toHaveLength(1);
  expect(subs[0].values).toMatchObject({ [nameId]: 'Grace Hopper', [ageId]: 42 });

  await deleteForm(session, formId);
});

/** A single-condition group that is satisfied when `fieldId` equals `value`. */
function showWhen(fieldId: string, value: string): Record<string, unknown> {
  return {
    logic: 'all',
    conditions: [{ fieldId, operator: 'eq', operand: { kind: 'literal', value } }],
    groups: [],
  };
}

test('submits when a required field is hidden by a condition', async ({ page, request }) => {
  const formName = uniqueName('runner-hidden');
  const nameId = uuid();
  const conditionalId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(formName, [
      {
        title: 'Details',
        elements: [
          { ...seedField('text', nameId, 'Name'), required: true },
          {
            ...seedField('text', conditionalId, 'Extra info'),
            required: true,
            enabledWhen: showWhen(nameId, 'show'),
          },
        ],
      },
    ]),
  );

  await page.goto(`/runner/${formId}`);
  await page.getByLabel('Name').fill('Ada Lovelace');

  // The required conditional field stays hidden, so the empty form submits fine.
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible();
  await expect(page.getByLabel('Extra info')).toHaveCount(0);

  const res = await session.request.get<{ values: Record<string, unknown> }[]>(
    `/api/forms/${formId}/submissions`,
    {
      headers: { Authorization: `Bearer ${session.token}` },
    },
  );
  const subs = await res.json();
  expect(subs).toHaveLength(1);
  expect(subs[0].values).toMatchObject({ [nameId]: 'Ada Lovelace' });
  expect(subs[0].values).not.toHaveProperty(conditionalId);

  await deleteForm(session, formId);
});

test('blocks submission while a revealed required field is still empty', async ({
  page,
  request,
}) => {
  const formName = uniqueName('runner-revealed');
  const triggerId = uuid();
  const conditionalId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(formName, [
      {
        title: 'Details',
        elements: [
          seedField('text', triggerId, 'Trigger'),
          {
            ...seedField('text', conditionalId, 'Extra info'),
            required: true,
            enabledWhen: showWhen(triggerId, 'yes'),
          },
        ],
      },
    ]),
  );

  await page.goto(`/runner/${formId}`);
  await page.getByLabel('Trigger').fill('yes');
  await expect(page.getByLabel('Extra info')).toBeVisible();

  // Empty required field is now visible → submission is blocked.
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('This field is required')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toHaveCount(0);

  await page.getByLabel('Extra info').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible();

  await deleteForm(session, formId);
});

test('enforces required fields nested inside groups', async ({ page, request }) => {
  const formName = uniqueName('runner-group');
  const memberId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(formName, [
      {
        title: 'Details',
        elements: [
          {
            id: uuid(),
            type: 'group',
            label: 'Team',
            description: '',
            width: 1,
            elements: [{ ...seedField('text', memberId, 'Member'), required: true }],
          },
        ],
      },
    ]),
  );

  await page.goto(`/runner/${formId}`);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('This field is required')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toHaveCount(0);

  await page.getByLabel('Member').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible();

  await deleteForm(session, formId);
});
