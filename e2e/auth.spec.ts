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

test('updates sessions live and revokes only the selected other session', async ({ page, browser, baseURL }) => {
  const otherContext = await browser.newContext({ locale: 'en-US', storageState: { cookies: [], origins: [] } });
  const other = await otherContext.newPage();
  try {
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Security' }).click();
    await expect(page.getByRole('heading', { name: 'Connected devices' })).toBeVisible();
    const sessionList = page.getByRole('list', { name: 'Connected devices' });
    const current = sessionList.getByRole('listitem').filter({ hasText: 'This device' });
    await expect(current).toBeVisible();
    const initialCount = await sessionList.getByRole('listitem').count();

    await other.goto('/login');
    await other.getByLabel('Email').fill('e2e@melody.test');
    await other.getByLabel('Password', { exact: true }).fill('e2e-password');
    await other.getByRole('button', { name: 'Sign in' }).click();
    await expect(other).toHaveURL(`${baseURL}/`);

    // No reload: the TanStack DB collection receives the new PocketBase record.
    await expect(sessionList.getByRole('listitem')).toHaveCount(initialCount + 1);
    await expect(current).toBeVisible();
    await expect(current.getByRole('button', { name: 'Sign out' })).toHaveCount(0);

    const otherRow = sessionList.getByRole('listitem').filter({ hasNotText: 'This device' }).first();
    await otherRow.getByRole('button', { name: /^Sign out / }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Sign out this device?' });
    await confirmation.getByRole('button', { name: 'Sign out', exact: true }).click();

    await expect(other).toHaveURL(/\/login$/);
    await expect(page).toHaveURL(/\/profile$/);
    // The delete event removes the row without reloading the security page.
    await expect(sessionList.getByRole('listitem')).toHaveCount(initialCount);
    await expect(page.getByText('This device')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/profile$/);

    await other.getByLabel('Email').fill('e2e@melody.test');
    await other.getByLabel('Password', { exact: true }).fill('e2e-password');
    await other.getByRole('button', { name: 'Sign in' }).click();
    await expect(other).toHaveURL(`${baseURL}/`);
    await other.route('**/api/sessions/current', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"failed"}' }));
    await other.getByRole('button', { name: /E2E/ }).click();
    await other.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(other.getByText('Could not sign out. Check your connection and try again.')).toBeVisible();
    await expect(other).toHaveURL(`${baseURL}/`);
    expect(await other.evaluate(() => localStorage.getItem('pb_auth_melody-manager'))).toBeTruthy();
    await other.unroute('**/api/sessions/current');

    await other.getByRole('button', { name: /E2E/ }).click();
    await expect(other.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
    const signedOut = other.waitForResponse((response) => response.url().endsWith('/api/sessions/current') && response.request().method() === 'DELETE');
    await other.getByRole('menuitem', { name: 'Log out' }).click();
    expect((await signedOut).status()).toBe(204);
    await expect(other).toHaveURL(/\/login$/);
  } finally {
    await otherContext.close();
  }
});
