import { expect, test, type Page } from './fixtures';
import {
  createForm,
  deleteForm,
  getForm,
  login,
  loginApi,
  makeForm,
  seedField,
  uniqueName,
  uuid,
} from './helpers';

async function selectRow(page: Page, label: string): Promise<void> {
  await page
    .locator('.row-select', { has: page.locator('.name', { hasText: new RegExp(`^${label}$`) }) })
    .click();
}

test('picks choice options by label for conditions and static defaults', async ({
  page,
  request,
}) => {
  const colorId = uuid();
  const detailsId = uuid();
  const blueId = uuid();
  const greenId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(
      uniqueName('option-picker'),
      [{ title: 'Details', children: [colorId, detailsId] }],
      [
        {
          ...seedField('choice', colorId, 'Color'),
          options: [
            { id: blueId, label: 'Blue' },
            { id: greenId, label: 'Green' },
          ],
        },
        {
          ...seedField('text', detailsId, 'Details'),
          enabledWhen: {
            logic: 'all',
            conditions: [
              { fieldId: colorId, operator: 'eq', operand: { kind: 'literal', value: blueId } },
            ],
            groups: [],
          },
        },
      ],
    ),
  );

  await login(page);
  await page.goto(`/builder?id=${formId}`);

  // The condition shows the option label, not its id, and saves the picked option's id.
  await selectRow(page, 'Details');
  const condition = page.locator('fm-property-panel fm-condition-editor mat-select').last();
  await expect(condition).toHaveText('Blue');
  await condition.click();
  await page.getByRole('option', { name: 'Green' }).click();
  await expect(condition).toHaveText('Green');

  // A static default of a choice question is picked from its options.
  await selectRow(page, 'Color');
  await page.locator('fm-property-panel mat-button-toggle', { hasText: 'Static' }).click();
  await page.getByRole('combobox', { name: 'Static value' }).click();
  await page.getByRole('option', { name: 'Green' }).click();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => {
      const elements = (await getForm(session, formId)).elements as Record<
        string,
        Record<string, unknown>
      >;
      return [elements[colorId].defaultValue, elements[detailsId].enabledWhen];
    })
    .toEqual([
      { kind: 'static', value: greenId },
      expect.objectContaining({
        conditions: [
          expect.objectContaining({
            fieldId: colorId,
            operator: 'eq',
            operand: { kind: 'literal', value: greenId },
          }),
        ],
      }),
    ]);

  // The runner applies both: Green is preselected, which reveals the conditional field.
  await page.goto(`/runner/${formId}`);
  await expect(page.getByRole('radio', { name: 'Green' })).toBeChecked();
  await expect(page.getByLabel('Details')).toBeVisible();

  await deleteForm(session, formId);
});
