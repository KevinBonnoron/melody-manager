import { expect, test } from './support/test';

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sends anyone without a session to the sign-in screen', async ({ page }) => {
    await page.goto('/library');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('refuses the wrong password without losing the form', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('e2e@melody.test');
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Email')).toHaveValue('e2e@melody.test');
  });
});

test('keeps the session across a reload', async ({ page }) => {
  await page.goto('/library');
  await page.reload();

  await expect(page).toHaveURL(/\/library$/);
});
