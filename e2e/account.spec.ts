import { APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';
import { uuid } from './helpers';

/** Register a fresh editor through the API and return its session credentials. */
async function registerAccount(request: APIRequestContext): Promise<{
  email: string;
  password: string;
  token: string;
}> {
  const email = `user-${uuid()}@formmaker.local`;
  const password = 'formmaker1';
  const res = await request.post('/api/auth/register', { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { token?: string };
  expect(body.token).toBeTruthy();
  return { email, password, token: body.token as string };
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

test('manages email, password and deletion over the account API', async ({ request }) => {
  const { email, password, token } = await registerAccount(request);

  const me = await (await request.get('/api/users/me', { headers: auth(token) })).json();
  expect((me as { email: string }).email).toBe(email);

  const newEmail = `renamed-${uuid()}@formmaker.local`;
  const renamed = await request.patch('/api/users/me', {
    headers: auth(token),
    data: { email: newEmail, currentPassword: password },
  });
  expect(renamed.status()).toBe(200);
  expect(((await renamed.json()) as { email: string }).email).toBe(newEmail);

  const newPassword = 'newpassword9';
  const changed = await request.patch('/api/users/me/password', {
    headers: auth(token),
    data: { currentPassword: password, newPassword: newPassword },
  });
  expect(changed.status()).toBe(204);

  // The old password no longer works; the new one does.
  const oldLogin = await request.post('/api/auth/login', { data: { email: newEmail, password } });
  expect(oldLogin.status()).toBe(401);
  const newLogin = await request.post('/api/auth/login', {
    data: { email: newEmail, password: newPassword },
  });
  expect(newLogin.ok()).toBeTruthy();
  const newSession = (await newLogin.json()) as { token: string };

  const removed = await request.delete('/api/users/me', {
    headers: auth(newSession.token),
    data: { currentPassword: newPassword },
  });
  expect(removed.status()).toBe(204);
  expect((await request.get('/api/auth/me', { headers: auth(token) })).status()).toBe(401);
});

test('changes email, password and deletes the account from the account page', async ({ page }) => {
  const email = `ui-${uuid()}@formmaker.local`;
  const password = 'formmaker1';
  const newEmail = `ui-renamed-${uuid()}@formmaker.local`;
  const newPassword = 'newpassword9';

  await page.goto('/login');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Repeat password', { exact: true }).fill(password);

  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL((url) => url.pathname === '/');

  await page.getByRole('link', { name: 'Account' }).click();
  await expect(page.getByRole('heading', { name: 'My account', exact: true })).toBeVisible();

  // Update the email address.
  let profile = page.locator('mat-card').filter({ hasText: 'Email address' });
  await expect(profile).toBeVisible();
  await profile.getByLabel('Email address').fill(newEmail);
  await profile.getByLabel('Current password').fill(password);
  await profile.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Email was changed successfully')).toBeVisible();

  // The new address survives a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My account', exact: true })).toBeVisible();
  profile = page.locator('mat-card').filter({ hasText: 'Email address' });
  await expect(profile.getByLabel('Email address')).toHaveValue(newEmail);

  // Change the password.
  const passwordCard = page.locator('mat-card').filter({ hasText: 'New password' });
  await passwordCard.getByLabel('Current password').fill(password);
  await passwordCard.getByLabel('New password', { exact: true }).fill(newPassword);
  await passwordCard.getByLabel('Confirm new password').fill(newPassword);
  await passwordCard.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Password was changed successfully')).toBeVisible();

  // The old password no longer signs in; the new one does.
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForURL((url) => url.pathname === '/login');
  await page.getByLabel('Email address').fill(newEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Login failed. Check your credentials.')).toBeVisible();

  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === '/');

  // Delete the account from the danger zone and end up back at login.
  await page.getByRole('link', { name: 'Account' }).click();
  await expect(page.getByRole('heading', { name: 'My account', exact: true })).toBeVisible();
  const danger = page.locator('mat-card').filter({ hasText: 'Danger zone' });
  await danger.getByRole('button', { name: 'Delete account' }).click();
  await danger.getByLabel('Current password').fill(newPassword);
  await danger.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('Account was deleted successfully')).toBeVisible();
  await page.waitForURL((url) => url.pathname === '/login');

  // The deleted account can no longer sign in.
  await page.getByLabel('Email address').fill(newEmail);
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Login failed. Check your credentials.')).toBeVisible();
});
