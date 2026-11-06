import { expect, test } from './support/test';

// The button on an album header shows the opinion held about it, and pressing
// it undoes that opinion rather than jumping to the opposite one.
test('takes back an ignored album without liking it', async ({ page, library }) => {
  await page.goto(`/albums/${library.albums.Matsuri}`);

  await page.getByRole('button', { name: 'Album actions' }).click();
  await page.getByRole('menuitem', { name: 'Dislike' }).click();
  await expect(page.getByRole('button', { name: 'Stop ignoring' })).toBeVisible();

  await page.getByRole('button', { name: 'Stop ignoring' }).click();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();

  await page.goto('/library?tab=albums');
  await expect(page.getByRole('link', { name: /Matsuri/ })).toHaveCount(0);
});
