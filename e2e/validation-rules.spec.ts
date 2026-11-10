import { expect, test, type Page } from './fixtures';
import {
  type ApiSession,
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

interface StoredRule {
  rule: string;
  message: string;
  pattern?: string;
}

async function selectRow(page: Page, label: string): Promise<void> {
  await page
    .locator('.row-select', { has: page.locator('.name', { hasText: new RegExp(`^${label}$`) }) })
    .click();
}

async function addRule(page: Page, name: string): Promise<void> {
  await page.locator('fm-validation-editor mat-select').click();
  await page.getByRole('option', { name }).click();
}

function ruleCard(page: Page, name: string) {
  return page.locator('fm-validation-editor .rule', { hasText: name });
}

async function storedRules(session: ApiSession, formId: string, id: string) {
  const { elements } = await getForm(session, formId);
  return (elements[id].validations ?? []) as StoredRule[];
}

test('creates, edits and removes validation rules on the server', async ({ page, request }) => {
  const nameId = uuid();
  const session = await loginApi(request);
  const formId = await createForm(
    session,
    makeForm(
      uniqueName('validation-rules'),
      [{ title: 'Details', children: [nameId] }],
      [seedField('text', nameId, 'Name')],
    ),
  );

  await login(page);
  await page.goto(`/builder?id=${formId}`);
  await selectRow(page, 'Name');

  // A picked rule is created on the server right away.
  await addRule(page, 'Regex pattern');
  await expect(ruleCard(page, 'Regex pattern')).toBeVisible();
  await expect
    .poll(async () => (await storedRules(session, formId, nameId)).map((r) => r.rule))
    .toEqual(['pattern']);

  // A committed edit is sent as a patch of that rule.
  const regex = ruleCard(page, 'Regex pattern').getByLabel('Regex (JS)');
  await regex.fill('^[A-Z]+$');
  await regex.press('Tab');
  await expect
    .poll(async () => (await storedRules(session, formId, nameId))[0]?.pattern)
    .toBe('^[A-Z]+$');

  // An invalid regex is rejected and reverted, and no later save carries it.
  await regex.fill('(');
  await regex.press('Tab');
  await expect(page.getByText('The rule change could not be saved.')).toBeVisible();
  await expect(regex).toHaveValue('^[A-Z]+$');
  await addRule(page, 'Min length');
  await expect
    .poll(async () => (await storedRules(session, formId, nameId)).map((r) => [r.rule, r.pattern]))
    .toEqual([
      ['pattern', '^[A-Z]+$'],
      ['minLength', undefined],
    ]);

  // A removed rule is deleted on the server and stays gone after a reload.
  await ruleCard(page, 'Regex pattern').getByRole('button', { name: 'Remove' }).click();
  await expect
    .poll(async () => (await storedRules(session, formId, nameId)).map((r) => r.rule))
    .toEqual(['minLength']);
  await page.reload();
  await selectRow(page, 'Name');
  await expect(ruleCard(page, 'Min length')).toBeVisible();
  await expect(ruleCard(page, 'Regex pattern')).toHaveCount(0);

  await deleteForm(session, formId);
});
