import { test, expect } from './fixtures';
import { createForm, deleteForm, loginApi, makeForm, seedField, uniqueName, uuid } from './helpers';

test('renders markdown in page titles, subtitles and question labels/descriptions', async ({
  page,
  request,
}) => {
  const formName = uniqueName('markdown');
  const nameId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(formName, [
      {
        title: 'About **you**',
        subtitle: 'Please fill in *everything*.',
        elements: [
          {
            ...seedField('text', nameId, 'Your **name**'),
            description: '- first item\n- second item',
          },
        ],
      },
    ]),
  );

  await page.goto(`/runner/${formId}`);

  // Page title: markdown emphasis is rendered, not shown literally.
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  await expect(page.locator('.page-head h1 strong')).toHaveText('you');

  // Page subtitle emphasis.
  await expect(page.locator('.page-head .subtitle em')).toHaveText('everything');

  // Question label (title) emphasis.
  const question = page.locator('.question');
  await expect(question.getByRole('heading', { name: 'Your name' })).toBeVisible();
  await expect(question.locator('h3 strong')).toHaveText('name');

  // Question description: markdown list.
  await expect(question.locator('.desc li')).toHaveText(['first item', 'second item']);

  await deleteForm(session, formId);
});
