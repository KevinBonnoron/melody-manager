import { expect, test } from './support/test';

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sends anyone without a session to the sign-in screen', async ({ page }) => {
    await page.goto('/library');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('does not open the authenticated event stream on the sign-in screen', async ({ page }) => {
    const eventRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/events') {
        eventRequests.push(request.url());
      }
    });

    await page.goto('/login');

    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(eventRequests).toEqual([]);
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
