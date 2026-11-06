import { expect, test } from './support/test';

test('adds an album to the library and finds it there', async ({ page, library }) => {
  await page.goto(`/albums/${library.albums.Stellar}`);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();

  await page.goto('/library?tab=albums');
  await expect(page.getByRole('link', { name: /Stellar/ })).toBeVisible();
});

test('connects an unlinked source from a detected URL', async ({ page }) => {
  await page.goto('/search');
  const main = page.getByRole('main');
  await expect(main.getByText(/Tip: paste/)).toHaveCount(0);

  await main.getByRole('textbox').fill('https://soundcloud.com/artist/track');
  await expect(main.getByText('This source is not configured or linked to your account')).toBeVisible();
  await expect(main.getByRole('button', { name: 'Add to my library', exact: true })).toHaveCount(0);

  try {
    await main.getByRole('button', { name: 'Connect SoundCloud', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'SoundCloud' });
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(main.getByText('Ready to import', { exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Add to my library', exact: true })).toBeVisible();
  } finally {
    await page.goto('/sources');
    const sourceLink = main.getByRole('link', { name: 'SoundCloud', exact: true });
    const availableButton = main.getByRole('button', { name: 'Connect SoundCloud', exact: true });
    await expect(sourceLink.or(availableButton)).toBeVisible();
    if (await sourceLink.count()) {
      await sourceLink.locator('../..').getByRole('button', { name: 'Disconnect', exact: true }).click();
      await page.getByRole('dialog', { name: 'Disconnect source', exact: true }).getByRole('button', { name: 'Disconnect', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Disconnect source', exact: true })).toHaveCount(0);
      await expect(sourceLink).toHaveCount(0);
    }
    await expect(availableButton).toBeVisible();
  }

  await page.keyboard.press('Control+k');
  const searchDialog = page.getByRole('dialog', { name: 'Search', exact: true });
  await searchDialog.getByRole('textbox').fill('https://soundcloud.com/artist/track');
  await expect(searchDialog.getByRole('button', { name: 'Connect SoundCloud', exact: true })).toBeVisible();
});

test('shows connected sources without tracks in library and search filters', async ({ page, library }) => {
  test.setTimeout(60_000);
  await page.goto(`/albums/${library.albums.Stellar}`);
  const addAlbum = page.getByRole('button', { name: 'Add', exact: true });
  const removeAlbum = page.getByRole('button', { name: 'Remove' });
  await expect(addAlbum.or(removeAlbum)).toBeVisible();
  if (await addAlbum.count()) {
    await addAlbum.click();
  }
  await expect(removeAlbum).toBeVisible();
  await page.goto('/library');
  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: 'SoundCloud', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'SoundCloud', exact: true }).click();
  const connectDialog = page.getByRole('dialog', { name: 'SoundCloud' });
  await connectDialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(connectDialog).toHaveCount(0);

  try {
    await expect(main.getByRole('button', { name: 'SoundCloud', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Bandcamp', exact: true }).click();
    const bandcampDialog = page.getByRole('dialog', { name: 'Bandcamp' });
    await bandcampDialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(bandcampDialog).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Bandcamp', exact: true })).toBeVisible();

    await page.keyboard.press('Control+k');
    const searchDialog = page.getByRole('dialog', { name: 'Search', exact: true });
    await expect(searchDialog.getByRole('button', { name: 'Local Files', exact: true })).toBeVisible();
    await expect(searchDialog.getByRole('button', { name: 'SoundCloud', exact: true })).toBeVisible();
    await expect(searchDialog.getByRole('button', { name: 'Bandcamp', exact: true })).toBeVisible();
    await expect(searchDialog.getByRole('button', { name: 'YouTube', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.goto('/search');
    await expect(main.getByRole('button', { name: 'Local Files', exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'SoundCloud', exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Bandcamp', exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'YouTube', exact: true })).toHaveCount(0);

    await main.getByRole('button', { name: 'Local Files', exact: true }).click();
    await main.getByRole('textbox').fill('Stella');
    await expect(main.getByText('Stella Magica', { exact: true })).toBeVisible();
  } finally {
    await page.goto('/sources');
    for (const source of ['SoundCloud', 'Bandcamp']) {
      const sourceLink = main.getByRole('link', { name: source, exact: true });
      const availableButton = main.getByRole('button', { name: `Connect ${source}`, exact: true });
      await expect(sourceLink.or(availableButton)).toBeVisible();
      if (await sourceLink.count()) {
        await sourceLink.locator('../..').getByRole('button', { name: 'Disconnect', exact: true }).click();
        await page.getByRole('dialog', { name: 'Disconnect source', exact: true }).getByRole('button', { name: 'Disconnect', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Disconnect source', exact: true })).toHaveCount(0);
        await expect(sourceLink).toHaveCount(0);
      }
      await expect(availableButton).toBeVisible();
    }
  }
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
