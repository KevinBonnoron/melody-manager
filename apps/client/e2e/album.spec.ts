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

test('keeps the album picker open while a move is pending and permits retry after failure', async ({ page, library, baseURL }) => {
  if (!baseURL) {
    throw new Error('The browser scenario requires a configured baseURL');
  }
  const api = new AdminApi(baseURL);
  await api.signIn();
  const sourceName = 'Pending move source';
  const missingName = 'Pending move removed target';
  const targetName = 'Pending move target';
  const title = 'Pending move track';
  const artists = [library.artists['Couple N']];
  const source = await api.create('albums', { name: sourceName, artists });
  const missing = await api.create('albums', { name: missingName, artists });
  const target = await api.create('albums', { name: targetName, artists });
  let releaseMove: (() => void) | undefined;

  try {
    await api.create('tracks', { title, duration: 210, origin: 'file:///e2e/pending-move.flac', source: 'local', availability: 'file', artists, album: source.id });
    let requests = 0;
    let requestStarted: (() => void) | undefined;
    let started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    await page.route('**/tracks/move', async (route) => {
      requests++;
      requestStarted?.();
      await new Promise<void>((resolve) => {
        releaseMove = resolve;
      });
      await route.continue();
    });

    await page.goto(`/albums/${source.id}`);
    const row = page.getByRole('row').filter({ hasText: title });
    const dialog = page.getByRole('dialog', { name: `Move "${title}"` });
    const openPicker = async () => {
      await row.getByRole('button', { name: 'Track actions' }).click();
      await page.getByRole('menuitem', { name: 'Move to album…' }).click();
      await expect(dialog).toBeVisible();
    };

    await openPicker();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
    await openPicker();
    await dialog.getByPlaceholder('Search albums...').fill(missingName);
    await dialog.getByRole('option', { name: new RegExp(missingName) }).click();
    await started;
    await api.delete('albums', missing.id as string);
    const failedResponse = page.waitForResponse((response) => response.url().endsWith('/tracks/move') && response.request().method() === 'POST');
    releaseMove?.();
    expect((await failedResponse).ok()).toBe(false);
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);

    started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    await openPicker();
    await dialog.getByPlaceholder('Search albums...').fill(targetName);
    await dialog.getByRole('option', { name: new RegExp(targetName) }).click();
    await started;
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder('Search albums...').press('Enter');
    expect(requests).toBe(2);
    const successResponse = page.waitForResponse((response) => response.url().endsWith('/tracks/move') && response.request().method() === 'POST');
    releaseMove?.();
    expect((await successResponse).ok()).toBe(true);
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/albums/${target.id}$`));
    expect(requests).toBe(2);
  } finally {
    releaseMove?.();
    const track = await api.first('tracks', `title = "${title}"`);
    if (track) {
      await api.delete('tracks', track.id as string);
    }
    for (const name of [sourceName, missingName, targetName]) {
      const album = await api.first('albums', `name = "${name}"`);
      if (album) {
        await api.delete('albums', album.id as string);
      }
    }
  }
});
