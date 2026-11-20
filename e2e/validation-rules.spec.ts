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

  // The messages of errors logged to the console, read from the error objects: Firefox
  // logs `ERROR Error` without the message. Only the one checked below matters: other
  // browsers also log icon requests cut off by navigating.
  const logged: Promise<string>[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const texts = msg
      .args()
      .map((arg) =>
        arg.evaluate((v) => (v instanceof Error ? v.message : String(v))).catch(() => ''),
      );
    logged.push(Promise.all(texts).then((parts) => [msg.text(), ...parts].join(' ')));
  });

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

  // An invalid regex is rejected, stays shown as unsaved, and no other change carries it.
  const banner = page.getByRole('alert').filter({ hasText: 'Some changes are not saved' });
  await regex.fill('(');
  await regex.press('Tab');
  await expect(page.getByText('The rule change could not be saved.')).toBeVisible();
  await expect(regex).toHaveValue('(');
  await expect(banner).toBeVisible();
  await addRule(page, 'Min length');
  await expect
    .poll(async () => (await storedRules(session, formId, nameId)).map((r) => [r.rule, r.pattern]))
    .toEqual([
      ['pattern', '^[A-Z]+$'],
      ['minLength', undefined],
    ]);

  // A removed rule is deleted on the server, its unsaved edit with it, and stays gone
  // after a reload.
  await ruleCard(page, 'Regex pattern').getByRole('button', { name: 'Remove' }).click();
  await expect
    .poll(async () => (await storedRules(session, formId, nameId)).map((r) => r.rule))
    .toEqual(['minLength']);
  await expect(banner).toBeHidden();

  // Reloading renders the builder only once the form is loaded: without a cached answer,
  // and while the server holds the form back.
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('formmaker.cache.form.')) localStorage.removeItem(key);
    }
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/forms/${formId}`, async (route) => {
    if (route.request().method() === 'GET') await held;
    await route.fallback();
  });
  const loading = page.waitForRequest(
    (req) => req.method() === 'GET' && req.url().endsWith(`/api/forms/${formId}`),
  );
  await page.reload();
  await loading;
  await expect(page.locator('fm-builder h1')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Preview' })).toHaveCount(0);
  release();

  await selectRow(page, 'Name');
  await expect(ruleCard(page, 'Min length')).toBeVisible();
  await expect(ruleCard(page, 'Regex pattern')).toHaveCount(0);
  const errors = await Promise.all(logged);
  expect(errors.filter((text) => text.includes('Form not set'))).toEqual([]);
  await deleteForm(session, formId);
});
