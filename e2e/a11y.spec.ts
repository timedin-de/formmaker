import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  createForm,
  deleteForm,
  login,
  loginApi,
  makeForm,
  seedField,
  uniqueName,
  uuid,
  type ApiSession,
} from './helpers';

const WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag2aaa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
  'best-practice',
  'EN-301-549',
  'section508',
  'ACT',
  'TTv5',
  'experimental',
];
async function expectNoViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .exclude('[id^="mat-snack-bar-container-live"]')
    .exclude('mat-snack-bar-container')
    .analyze();
  expect(
    violations.map((v) => ({
      rule: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')),
    })),
  ).toEqual([]);
}

/** Mock form covering many element types: the shared example from the repo root. */
function mockForm(name: string): Record<string, unknown> {
  const now = new Date().toISOString();
  const example = JSON.parse(readFileSync('example.json', 'utf8')) as Record<string, unknown>;
  return { ...example, id: uuid(), name, createdAt: now, updatedAt: now };
}

/** 1×1 transparent PNG, enough for signature and file values. */
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Values for every visible question of example.json, covering each value kind. */
function exampleValues(name: string): Record<string, unknown> {
  return {
    q_name: name,
    q_email: 'jane@example.com',
    q_phone: '+1 555 0100',
    q_website: 'https://example.com',
    q_dob: '1990-05-01',
    q_time: '09:15',
    q_terms: true,
    q_favorite: 'choc',
    q_country: 'US',
    q_tags: ['a', 'b'],
    q_price: 49.99,
    q_quantity: '12',
    q_bio: 'Writes **markdown** and code.',
    q_rating: 4,
    q_upload: [{ name: 'doc.png', size: 68, mimeType: 'image/png', dataUrl: PNG_DATA_URL }],
    q_street: 'Main Street 1',
    q_city: 'Springfield',
    q_sign: { dataUrl: PNG_DATA_URL, width: 1, height: 1, mimeType: 'image/png' },
  };
}

async function addSubmission(
  session: ApiSession,
  formId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const res = await session.request.post(`/api/forms/${formId}/submissions`, {
    data: { formId, durationMs: 83_000, values },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

/** Selects a canvas row by its exact label. */
async function selectRow(page: Page, label: string): Promise<void> {
  await page
    .locator('.row-select', { has: page.locator('.name', { hasText: new RegExp(`^${label}$`) }) })
    .click();
}

test.describe('accessibility', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'A11y not browser dependent. Only checked for chromium',
  );
  let session: ApiSession;
  let formId: string;

  test.beforeEach(async ({ request }) => {
    session = await loginApi(request);
    formId = await createForm(session, mockForm(uniqueName('a11y')));
  });

  test.afterEach(async () => {
    await deleteForm(session, formId);
  });

  test.describe('login', () => {
    test('login page', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      await expectNoViolations(page);
    });

    test('login page with a failed sign-in', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email address', { exact: true }).fill('admin@formmaker.local');
      await page.getByLabel('Password', { exact: true }).fill('definitely-wrong');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByText('Login failed. Check your credentials.')).toBeVisible();
      await expectNoViolations(page);
    });
  });

  test.describe('landing', () => {
    test('landing page', async ({ page }) => {
      await login(page);
      await expect(page.locator('.card').first()).toBeVisible();
      await expectNoViolations(page);
    });

    test('import menu', async ({ page }) => {
      await login(page);
      await page.getByRole('button', { name: 'Import form' }).click();
      await expect(page.getByRole('menuitem', { name: 'Import from text' })).toBeVisible();
      await expectNoViolations(page);
    });

    test('import-from-text dialog', async ({ page }) => {
      await login(page);
      await page.getByRole('button', { name: 'Import form' }).hover();
      await page.getByRole('menuitem', { name: 'Import from text' }).click();
      await expect(page.getByText('Import form from text')).toBeVisible();
      await expectNoViolations(page);
    });
  });

  test.describe('account', () => {
    test('account page', async ({ page }) => {
      await login(page);
      await page.goto('/account');
      await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
      await expectNoViolations(page);
    });

    test('account deletion confirmation', async ({ page }) => {
      await login(page);
      await page.goto('/account');
      await page.getByRole('button', { name: 'Delete account' }).click();
      await expect(page.getByRole('button', { name: 'Delete permanently' })).toBeVisible();
      await expectNoViolations(page);
    });
  });

  test.describe('runner', () => {
    test('first page of the example form', async ({ page }) => {
      await page.goto(`/runner/${formId}`);
      await expect(page.locator('input, textarea').first()).toBeVisible();
      await expectNoViolations(page);
    });

    test('example form with every conditional field revealed', async ({ page }) => {
      await page.goto(`/runner/${formId}`);
      await page.getByLabel('Quantity (text, numeric input)').fill('12');
      await expect(page.getByLabel('Bio')).toBeVisible();
      await expectNoViolations(page);
    });

    test('validation errors', async ({ page }) => {
      await page.goto(`/runner/${formId}`);
      await page.getByLabel('Full name').fill('');
      await page.getByRole('button', { name: 'Send order' }).click();
      await expect(page.getByText('This field is required').first()).toBeVisible();
      await expectNoViolations(page);
    });

    test('later page and thank-you screen', async ({ page }) => {
      const multiPageId = await createForm(
        session,
        makeForm(uniqueName('a11y-pages'), [
          {
            title: 'About you',
            subtitle: 'Step **one**',
            elements: [seedField('text', uuid(), 'Name')],
          },
          { title: 'Details', subtitle: '', elements: [seedField('number', uuid(), 'Age')] },
        ]),
      );
      try {
        await page.goto(`/runner/${multiPageId}`);
        await page.getByLabel('Name').fill('Grace Hopper');
        await page.getByRole('button', { name: 'Next' }).click();
        await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Back' }).nth(1)).toBeVisible();
        await expectNoViolations(page);

        await page.getByLabel('Age').fill('42');
        await page.getByRole('button', { name: 'Submit' }).click();
        await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible();
        await expectNoViolations(page);
      } finally {
        await deleteForm(session, multiPageId);
      }
    });
  });

  test.describe('builder', () => {
    test('existing form', async ({ page }) => {
      await login(page);
      await page.goto(`/builder?id=${formId}`);
      await expect(page.locator('mat-form-field').first()).toBeVisible();
      await expectNoViolations(page);
    });

    test('new empty form', async ({ page }) => {
      await login(page);
      await page.goto('/builder?new=1');
      await expect(page.locator('mat-form-field').first()).toBeVisible();
      await expectNoViolations(page);
    });

    test('property panel with validations and a condition', async ({ page }) => {
      await login(page);
      await page.goto(`/builder?id=${formId}`);
      await selectRow(page, 'Phone');
      await expect(page.locator('fm-property-panel input').first()).toBeVisible();
      await expectNoViolations(page);
    });

    test('property panel for a choice question', async ({ page }) => {
      await login(page);
      await page.goto(`/builder?id=${formId}`);
      await selectRow(page, 'Country');
      await expect(page.locator('fm-property-panel input').first()).toBeVisible();
      await expectNoViolations(page);
    });

    test('property modal on a narrow screen', async ({ page }) => {
      await page.setViewportSize({ width: 800, height: 900 });
      await login(page);
      await page.goto(`/builder?id=${formId}`);
      await selectRow(page, 'Full name');
      await expect(page.locator('dialog fm-property-panel')).toBeVisible();
      await expectNoViolations(page);
    });

    test('add-question dialog', async ({ page }) => {
      await login(page);
      await page.goto(`/builder?id=${formId}`);
      await page.getByRole('button', { name: 'Add question' }).first().click();
      await expect(page.locator('dialog fm-builder-palette')).toBeVisible();
      await expectNoViolations(page);
    });
  });

  test.describe('results', () => {
    test('without submissions', async ({ page }) => {
      await login(page);
      await page.goto(`/results/${formId}`);
      await expect(page.getByText('0 submission(s)')).toBeVisible();
      await expectNoViolations(page);
    });

    test('with real submissions', async ({ page }) => {
      await addSubmission(session, formId, exampleValues('Jane Doe'));
      // A minimal one: only required fields, so empty cells render too.
      const minimal = exampleValues('John Roe');
      for (const key of ['q_phone', 'q_website', 'q_time', 'q_street', 'q_city', 'q_rating']) {
        delete minimal[key];
      }
      await addSubmission(session, formId, minimal);

      await login(page);
      await page.goto(`/results/${formId}`);
      await expect(page.locator('.submission-card')).toHaveCount(2);
      await expectNoViolations(page);
    });
  });
});
