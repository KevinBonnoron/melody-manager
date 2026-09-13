import { expect, test } from './support/test';

test('adds an album to the library and finds it there', async ({ page, library }) => {
  await page.goto(`/albums/${library.albums.Stellar}`);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();

  await page.goto('/library?tab=albums');
  await expect(page.getByRole('link', { name: /Stellar/ })).toBeVisible();
});

test('creates a playlist from the card in the grid', async ({ page }) => {
  const name = `Road trip ${Date.now()}`;

  await page.goto('/library?tab=playlists');
  await page.getByRole('button', { name: 'Create a playlist' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create a playlist' }).click();

  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();

  await page.goto('/library?tab=playlists');
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
});
