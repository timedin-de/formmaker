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

async function pickStatic(page: Page): Promise<void> {
  await page.locator('fm-property-panel mat-button-toggle', { hasText: 'Static' }).click();
}

test('enters defaults and condition values with the control of the question type', async ({
  page,
  request,
}) => {
  const ageId = uuid();
  const startId = uuid();
  const agreeId = uuid();
  const signId = uuid();
  const noteId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(
      uniqueName('typed-values'),
      [{ title: 'Details', children: [ageId, startId, agreeId, signId, noteId] }],
      [
        // A stored default that no longer fits a number question.
        { ...seedField('number', ageId, 'Age'), defaultValue: { kind: 'static', value: 'twelve' } },
        seedField('date', startId, 'Start'),
        seedField('boolean', agreeId, 'Agree'),
        seedField('signature', signId, 'Sign'),
        {
          ...seedField('text', noteId, 'Note'),
          enabledWhen: {
            logic: 'all',
            conditions: [
              { fieldId: ageId, operator: 'gt', operand: { kind: 'literal', value: 18 } },
            ],
            groups: [],
          },
        },
      ],
    ),
  );

  await login(page);
  await page.goto(`/builder?id=${formId}`);
  const panel = page.locator('fm-property-panel');

  // The mismatched default stays visible as text until it is fixed; then the number input shows.
  await selectRow(page, 'Age');
  const raw = panel.getByLabel('Static value');
  await expect(raw).toHaveValue('twelve');
  await expect(panel.getByText("Doesn't match the question type")).toBeVisible();
  await raw.fill('30');
  await raw.press('Tab');
  await expect(panel.getByRole('spinbutton', { name: 'Static value' })).toHaveValue('30');

  await selectRow(page, 'Start');
  await pickStatic(page);
  await expect(panel.getByLabel('Static value')).toHaveAttribute('type', 'date');
  await panel.getByLabel('Static value').fill('2026-12-24');

  await selectRow(page, 'Agree');
  await pickStatic(page);
  await panel.getByRole('combobox', { name: 'Static value' }).click();
  await page.getByRole('option', { name: 'Yes' }).click();

  // Signatures have no fixed value to pick.
  await selectRow(page, 'Sign');
  await expect(panel.locator('mat-button-toggle', { hasText: 'Expression' })).toBeVisible();
  await expect(panel.locator('mat-button-toggle', { hasText: 'Static' })).toHaveCount(0);

  // The condition literal on Age is a number input as well.
  await selectRow(page, 'Note');
  const literal = panel.locator('fm-condition-editor').getByRole('spinbutton', { name: 'value' });
  await expect(literal).toHaveValue('18');
  await literal.fill('25');

  await selectRow(page, 'Age');
  await expect
    .poll(async () => {
      const { elements } = await getForm(session, formId);
      return [
        elements[ageId].defaultValue,
        elements[startId].defaultValue,
        elements[agreeId].defaultValue,
        elements[noteId].enabledWhen?.conditions?.[0]?.operand,
      ];
    })
    .toEqual([
      { kind: 'static', value: 30 },
      { kind: 'static', value: '2026-12-24' },
      { kind: 'static', value: true },
      { kind: 'literal', value: 25 },
    ]);

  // The runner applies the typed defaults: 30 > 25 reveals the note.
  await page.goto(`/runner/${formId}`);
  await expect(page.getByLabel('Age')).toHaveValue('30');
  await expect(page.getByLabel('Start')).toHaveValue('2026-12-24');
  await expect(page.getByRole('checkbox', { name: 'Agree' })).toBeChecked();
  await expect(page.getByLabel('Note')).toBeVisible();

  await deleteForm(session, formId);
});
