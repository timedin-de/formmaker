import { expect, test } from './fixtures';
import {
  createForm,
  deleteForm,
  loginApi,
  makeForm,
  seedField,
  seedGroup,
  uniqueName,
  uuid,
  type SeedElement,
} from './helpers';

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
    makeForm(
      formName,
      [
        { title: 'About you', children: [nameId] },
        { title: 'Details', children: [ageId] },
      ],
      [seedField('text', nameId, 'Name'), seedField('number', ageId, 'Age')],
    ),
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
    makeForm(
      formName,
      [{ title: 'Details', children: [nameId, conditionalId] }],
      [
        { ...seedField('text', nameId, 'Name'), required: true },
        {
          ...seedField('text', conditionalId, 'Extra info'),
          required: true,
          enabledWhen: showWhen(nameId, 'show'),
        },
      ],
    ),
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
    makeForm(
      formName,
      [{ title: 'Details', children: [triggerId, conditionalId] }],
      [
        seedField('text', triggerId, 'Trigger'),
        {
          ...seedField('text', conditionalId, 'Extra info'),
          required: true,
          enabledWhen: showWhen(triggerId, 'yes'),
        },
      ],
    ),
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

/** An optional question of `type`, with the props its schema requires. */
function seedOptionalQuestion(type: string, id: string): SeedElement {
  const field = seedField(type, id, `Optional ${type}`);
  if (type === 'choice' || type === 'dropdown' || type === 'multiChoice') {
    return {
      ...field,
      options: [
        { id: uuid(), label: 'Yes' },
        { id: uuid(), label: 'No' },
      ],
    };
  }
  if (type === 'scale') return { ...field, min: 1, max: 5, step: 1 };
  return field;
}

test('submits a form mixing display-only elements with every question type', async ({
  page,
  request,
}) => {
  const formName = uniqueName('runner-mixed');
  const nameId = uuid();
  const displayIds = [uuid(), uuid(), uuid(), uuid(), uuid()];
  const optionalIds = new Map(
    [
      'longText',
      'number',
      'date',
      'time',
      'dateTime',
      'boolean',
      'choice',
      'dropdown',
      'multiChoice',
      'scale',
      'file',
      'signature',
    ].map((type) => [type, uuid()]),
  );
  const groupId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(
      formName,
      [
        { title: 'Details', children: [displayIds[0], displayIds[1], nameId, groupId] },
        { title: 'Closing', children: [displayIds[3], displayIds[4]] },
      ],
      [
        seedField('textdisplay', displayIds[0], 'Please answer honestly.'),
        seedField('section', displayIds[1], 'Personal'),
        { ...seedField('text', nameId, 'Name'), required: true },
        seedGroup(groupId, 'More', [displayIds[2], ...optionalIds.values()]),
        seedField('textdisplay', displayIds[2], 'Everything below is optional.'),
        ...[...optionalIds].map(([type, id]) => seedOptionalQuestion(type, id)),
        seedField('section', displayIds[3], 'Almost done'),
        seedField('textdisplay', displayIds[4], 'Thanks for your time.'),
      ],
    ),
  );

  await page.goto(`/runner/${formId}`);
  await expect(page.getByText('Please answer honestly.')).toBeVisible();
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Closing' })).toBeVisible();
  await expect(page.getByText('Thanks for your time.')).toBeVisible();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible();

  // Only questions are stored; display-only elements never carry a value.
  const res = await session.request.get<{ values: Record<string, unknown> }[]>(
    `/api/forms/${formId}/submissions`,
    {
      headers: { Authorization: `Bearer ${session.token}` },
    },
  );
  const subs = await res.json();
  expect(subs).toHaveLength(1);
  expect(subs[0].values).toMatchObject({ [nameId]: 'Ada Lovelace' });
  for (const id of displayIds) expect(subs[0].values).not.toHaveProperty(id);
  for (const id of Object.keys(subs[0].values)) {
    expect([nameId, ...optionalIds.values()]).toContain(id);
  }

  await deleteForm(session, formId);
});

test('enforces required fields nested inside groups', async ({ page, request }) => {
  const formName = uniqueName('runner-group');
  const groupId = uuid();
  const memberId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(
      formName,
      [{ title: 'Details', children: [groupId] }],
      [
        {
          id: groupId,
          type: 'group',
          label: 'Team',
          description: '',
          width: 1,
          children: [memberId],
        },
        { ...seedField('text', memberId, 'Member'), required: true },
      ],
    ),
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
