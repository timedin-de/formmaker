import { expect, test } from './fixtures';
import { deleteForm, getForm, login, loginApi, uniqueName } from './helpers';

test('accepts scale bounds by their value count and rejects too many values', async ({
  page,
  request,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'New form' }).first().click();
  await page.waitForURL(/\?id=/);
  const formId = new URL(page.url()).searchParams.get('id') ?? '';
  await page.getByLabel('Form name').fill(uniqueName('scale-bounds'));

  await page.getByRole('tab', { name: 'Advanced' }).click();
  await page
    .locator('.palette .mat-mdc-tab-body-active .field-btn')
    .filter({ hasText: 'Rating scale' })
    .click();
  await page
    .locator('.canvas #dropList_main > .cdk-drag > fm-element-row > .row > .row-head > .row-select')
    .click();

  const min = page.getByLabel('Min', { exact: true });
  const max = page.getByLabel('Max', { exact: true });
  const step = page.getByLabel('Step', { exact: true });
  const error = page.getByText('Min, max and step must give 1 to 11 values.');

  async function expectValid(valid: boolean): Promise<void> {
    for (const input of [min, max, step]) {
      await expect(input).toHaveAttribute('aria-invalid', String(!valid));
      // No native constraint contradicts the count either.
      expect(await input.evaluate((i: HTMLInputElement) => i.validity.valid)).toBe(true);
    }
    await expect(error).toBeVisible({ visible: !valid });
  }

  // 0, 2, …, 20: eleven values. A max that is not on a step (21) gives the same eleven.
  await min.fill('0');
  await step.fill('2');
  await max.fill('20');
  await expectValid(true);
  await max.fill('21');
  await expectValid(true);
  // A step past the whole range still gives one value.
  await step.fill('30');
  await expectValid(true);

  // 0, 1, …, 21: too many, so it is not saved.
  await step.fill('1');
  await expectValid(false);
  await expect
    .poll(async () => {
      const form = await getForm(await loginApi(request), formId);
      return Object.values(form.elements).find((e) => e.type === 'scale');
    })
    .toMatchObject({ min: 0, max: 21, step: 30 });

  await deleteForm(await loginApi(request), formId);
});
