import { expect, test } from './fixtures';
import {
  createForm,
  loginAs,
  makeForm,
  registerUser,
  seedField,
  setEncryptionKey,
  uniqueName,
  uuid,
  type UserSession,
} from './helpers';

const PASSPHRASE = 'a very long passphrase';

/** A form whose `Secret` answer is encrypted and whose `Public` answer is not. */
async function encryptedForm(user: UserSession): Promise<{ formId: string; secretId: string }> {
  const publicId = uuid();
  const secretId = uuid();
  const form = makeForm(
    uniqueName('encrypted'),
    [{ title: 'Questions', children: [publicId, secretId] }],
    [
      seedField('text', publicId, 'Public'),
      { ...seedField('text', secretId, 'Secret'), encrypted: true },
    ],
  );
  const settings = form.settings as Record<string, unknown>;
  const formId = await createForm(user, {
    ...form,
    settings: { ...settings, encryption: { mode: 'fields' } },
  });
  return { formId, secretId };
}

test('creates an encryption key on the account page', async ({ page, request }) => {
  const user = await registerUser(request);
  await loginAs(page, user);
  await page.goto('/account');

  await expect(page.getByText('You have no encryption key yet.')).toBeVisible();
  await page.getByLabel('Key passphrase', { exact: true }).fill(PASSPHRASE);
  await page.getByLabel('Repeat passphrase', { exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Create key' }).click();

  await expect(page.getByTestId('key-fingerprint')).toHaveText(/^.{4}-.{4}-.{4}-.{4}$/);
  const res = await request.get('/api/users/me/encryption-key', {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  expect(res.ok()).toBeTruthy();
});

test('encrypts the marked answer in the runner and decrypts it in the results', async ({
  page,
  request,
}) => {
  const user = await registerUser(request);
  await setEncryptionKey(user, PASSPHRASE);
  const { formId, secretId } = await encryptedForm(user);

  await page.goto(`/runner/${formId}`);
  await expect(
    page.getByText('Answers marked with a lock are end-to-end encrypted.'),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Encrypted answer' })).toHaveCount(1);
  await page.getByLabel('Public').fill('open text');
  await page.getByLabel('Secret').fill('top secret');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible();

  // The server only holds ciphertext for the secret answer.
  const res = await request.get(`/api/forms/${formId}/submissions`, {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  const stored = await res.text();
  expect(stored).toContain('open text');
  expect(stored).not.toContain('top secret');
  expect(stored).not.toContain(secretId);

  await loginAs(page, user);
  await page.goto(`/results/${formId}`);
  await expect(page.getByText('Encrypted', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'CSV' })).toBeDisabled();

  await page.getByLabel('Key passphrase').fill('not the passphrase');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Wrong passphrase')).toBeVisible();

  await page.getByLabel('Key passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('top secret')).toBeVisible();
  await expect(page.getByText('open text')).toBeVisible();
  await expect(page.getByRole('button', { name: 'CSV' })).toBeEnabled();
});

test('refuses answers while the form owner has no key', async ({ page, request }) => {
  const user = await registerUser(request);
  const { formId } = await encryptedForm(user);

  await page.goto(`/runner/${formId}`);
  await expect(page.getByRole('alert')).toContainText('This form cannot accept answers yet');
});

test('switches the encryption mode in the builder', async ({ page, request }) => {
  const user = await registerUser(request);
  const key = await setEncryptionKey(user, PASSPHRASE);
  const { formId } = await encryptedForm(user);

  await loginAs(page, user);
  await page.goto(`/builder?id=${formId}`);
  await page.getByRole('button', { name: 'Encryption' }).click();
  const dialog = page.getByRole('dialog', { name: 'Submission encryption' });
  await expect(dialog.getByText('1 question(s) encrypted.')).toBeVisible();
  await expect(dialog.locator('code')).toHaveText(key.keyId.slice(0, 16).match(/.{4}/g)!.join('-'));

  await dialog.getByRole('radio', { name: 'Whole form' }).click();
  await expect(dialog.getByText('Every answer is end-to-end encrypted.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

  const form = await (await request.get(`/api/forms/${formId}`)).json();
  expect(form.settings.encryption).toMatchObject({ mode: 'form', keyId: key.keyId });
});
