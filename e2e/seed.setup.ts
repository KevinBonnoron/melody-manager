import { expect, test as setup } from '@playwright/test';
import { account, paths } from '../playwright.config';
import { seed } from './support/seed';

// Signing in is done once, through the form, and the session is handed to every
// other test as a saved storage state. The form is worth driving rather than
// faking: if it breaks, nothing else can run either, and this is where it shows.
setup('seeds the library and signs in', async ({ page, baseURL }) => {
  await seed(baseURL as string);

  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: paths.authFile });
});
