import { test, expect } from './fixtures';
import { PASSWORD, login } from './helpers';

test('guards editor routes and signs in with the editor password', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrong password.')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === '/');

  await expect(page.getByRole('heading', { name: 'Forms', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('keeps forms readable after reload while the session lasts', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Forms', exact: true })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Forms', exact: true })).toBeVisible();
});
