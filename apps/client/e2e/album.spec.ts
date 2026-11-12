import { AdminApi } from './support/api';
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

test('moving tracks only leaves the source page when its last track is removed', async ({ page, library, baseURL }) => {
  if (!baseURL) {
    throw new Error('The browser scenario requires a configured baseURL');
  }
  const api = new AdminApi(baseURL);
  await api.signIn();
  const sourceName = 'Move source';
  const targetName = 'Move target';
  const titles = ['First move', 'Last move'];
  const artists = [library.artists['Couple N']];
  const source = await api.create('albums', { name: sourceName, artists });
  const target = await api.create('albums', { name: targetName, artists });

  try {
    for (const title of titles) {
      await api.create('tracks', { title, duration: 210, origin: `file:///e2e/${title}.flac`, source: 'local', availability: 'file', artists, album: source.id });
    }

    await page.goto(`/albums/${source.id}`);
    for (const [index, title] of titles.entries()) {
      const row = page.getByRole('row').filter({ hasText: title });
      await row.getByRole('button', { name: 'Track actions' }).click();
      await page.getByRole('menuitem', { name: 'Move to album…' }).click();
      const dialog = page.getByRole('dialog', { name: `Move "${title}"` });
      await dialog.getByPlaceholder('Search albums...').fill(targetName);
      await dialog.getByRole('option', { name: new RegExp(targetName) }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/albums/${index === 0 ? source.id : target.id}$`));
    }
  } finally {
    for (const title of titles) {
      const track = await api.first('tracks', `title = "${title}"`);
      if (track) {
        await api.delete('tracks', track.id as string);
      }
    }
    for (const name of [sourceName, targetName]) {
      const album = await api.first('albums', `name = "${name}"`);
      if (album) {
        await api.delete('albums', album.id as string);
      }
    }
  }
});
