import { expect, test, type Page } from './fixtures';
import {
  createForm,
  deleteForm,
  getForm,
  login,
  loginApi,
  makeForm,
  seedField,
  seedGroup,
  showWhen,
  uniqueName,
  uuid,
  type SeedElement,
  type StoredElement,
} from './helpers';

/** The id of the option labelled `label` of the stored choice question `choice`. */
function optionId(choice: StoredElement, label: string): string {
  const option = choice.options?.find((o) => o.label === label);
  expect(option, `option ${label} of ${choice.label}`).toBeTruthy();
  return option!.id;
}

/**
 * A "Color" choice preset to Green, and a "Notes" field shown only while Blue is picked.
 * Both refer to Color's options by id.
 */
function colorWithNotes(): {
  colorId: string;
  notesId: string;
  blueId: string;
  greenId: string;
  elements: SeedElement[];
} {
  const colorId = uuid();
  const notesId = uuid();
  const blueId = uuid();
  const greenId = uuid();
  return {
    colorId,
    notesId,
    blueId,
    greenId,
    elements: [
      {
        ...seedField('choice', colorId, 'Color'),
        options: [
          { id: blueId, label: 'Blue' },
          { id: greenId, label: 'Green' },
        ],
        defaultValue: { kind: 'static', value: greenId },
      },
      { ...seedField('text', notesId, 'Notes'), enabledWhen: showWhen(colorId, blueId) },
    ],
  };
}

/** Expects the copied Color to preset its own Green and the copied Notes to depend on its own Blue. */
function expectCopyReferencesItself(
  copiedColor: StoredElement,
  copiedNotes: StoredElement,
  original: { colorId: string; blueId: string; greenId: string },
): void {
  expect(copiedColor.id).not.toBe(original.colorId);
  const green = optionId(copiedColor, 'Green');
  const blue = optionId(copiedColor, 'Blue');
  expect(green).not.toBe(original.greenId);
  expect(blue).not.toBe(original.blueId);

  expect(copiedColor.defaultValue).toEqual({ kind: 'static', value: green });
  expect(copiedNotes.enabledWhen).toEqual(
    expect.objectContaining({
      conditions: [
        expect.objectContaining({
          fieldId: copiedColor.id,
          operand: { kind: 'literal', value: blue },
        }),
      ],
    }),
  );
}

async function duplicateElement(page: Page, label: string): Promise<void> {
  await page
    .locator('fm-element-row', { has: page.getByText(label, { exact: true }) })
    .first()
    .getByRole('button', { name: 'Duplicate', exact: true })
    .first()
    .click();
}

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
  await duplicateElement(page, 'Address');

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
  await expect.poll(async () => (await getForm(session, formId)).pages.length).toBe(2);
  const copyId = (await getForm(session, formId)).pages[1].id;

  await expect(page).toHaveURL(new RegExp(`[?&]page=${copyId}(&|$)`));
  await expect(page.locator('.page-name[aria-current="page"]')).toHaveText('Details (copy)');
  // Only the page title is marked as a copy, not the elements on it.
  const labels = Object.values((await getForm(session, formId)).elements).map((el) => el.label);
  expect(labels.sort()).toEqual(['Name', 'Name']);

  await deleteForm(session, formId);
});

test('duplicates a choice question with its static preset', async ({ page, request }) => {
  const session = await loginApi(request);
  const seed = colorWithNotes();
  const formId = await createForm(
    session,
    makeForm(
      uniqueName('duplicate-preset'),
      [{ title: 'Colors', children: [seed.colorId, seed.notesId] }],
      seed.elements,
    ),
  );

  await login(page);
  await page.goto(`/builder?id=${formId}`);
  await duplicateElement(page, 'Color');

  await expect
    .poll(async () => Object.keys((await getForm(session, formId)).elements).length)
    .toBe(3);
  const { elements } = await getForm(session, formId);
  const copy = Object.values(elements).find((el) => el.label === 'Color (copy)')!;
  expect(copy.id).not.toBe(seed.colorId);
  const green = optionId(copy, 'Green');
  expect(green).not.toBe(seed.greenId);
  expect(copy.defaultValue).toEqual({ kind: 'static', value: green });

  // Notes was not copied, so it still depends on the original question.
  expect(elements[seed.notesId].enabledWhen).toEqual(
    expect.objectContaining({
      conditions: [
        expect.objectContaining({
          fieldId: seed.colorId,
          operand: { kind: 'literal', value: seed.blueId },
        }),
      ],
    }),
  );

  await deleteForm(session, formId);
});

test('duplicates a group whose choice question sits in a nested group', async ({
  page,
  request,
}) => {
  const session = await loginApi(request);
  const seed = colorWithNotes();
  const outerId = uuid();
  const innerId = uuid();
  const formId = await createForm(
    session,
    makeForm(
      uniqueName('duplicate-group-refs'),
      [{ title: 'Colors', children: [outerId] }],
      // Outer > Inner > Color; Notes sits in Outer and depends on the nested Color.
      [
        seedGroup(outerId, 'Outer', [innerId, seed.notesId]),
        seedGroup(innerId, 'Inner', [seed.colorId]),
        ...seed.elements,
      ],
    ),
  );

  await login(page);
  await page.goto(`/builder?id=${formId}`);
  await duplicateElement(page, 'Outer');

  await expect
    .poll(async () => Object.keys((await getForm(session, formId)).elements).length)
    .toBe(8);
  const { elements } = await getForm(session, formId);
  const outer = Object.values(elements).find((el) => el.label === 'Outer (copy)')!;
  const [innerCopyId, notesCopyId] = outer.children!;
  const colorCopyId = elements[innerCopyId].children![0];
  expectCopyReferencesItself(elements[colorCopyId], elements[notesCopyId], seed);

  await deleteForm(session, formId);
});

test('duplicates a page with condition and preset references', async ({ page, request }) => {
  const session = await loginApi(request);
  const seed = colorWithNotes();
  const groupId = uuid();
  const formId = await createForm(
    session,
    makeForm(
      uniqueName('duplicate-page-refs'),
      [{ title: 'Colors', children: [seed.colorId, groupId] }],
      [seedGroup(groupId, 'More', [seed.notesId]), ...seed.elements],
    ),
  );

  await login(page);
  await page.goto(`/builder?id=${formId}`);
  await page.getByRole('button', { name: 'Duplicate Page' }).click();

  await expect.poll(async () => (await getForm(session, formId)).pages.length).toBe(2);
  const { pages, elements } = await getForm(session, formId);
  const [colorCopyId, groupCopyId] = pages[1].children;
  const notesCopyId = elements[groupCopyId].children![0];
  expectCopyReferencesItself(elements[colorCopyId], elements[notesCopyId], seed);

  // The runner applies them on the copied page: Green is preset, and Notes follows the
  // copied question rather than the original one on the first page.
  await page.goto(`/runner/${formId}`);
  await expect(page.getByRole('heading', { name: 'Colors', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Colors (copy)' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Green' })).toBeChecked();
  await expect(page.getByLabel('Notes')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Blue' }).check();
  await expect(page.getByLabel('Notes')).toBeVisible();

  await deleteForm(session, formId);
});
