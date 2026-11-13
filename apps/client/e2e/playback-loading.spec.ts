import { paths } from '../playwright.config';
import { authorization, playerState } from './support/playback';
import { expect, test } from './support/test';

// A stream takes seconds to start. Until the device playing it makes a sound,
// the record waits, and a page watching that device shows it loading rather
// than a playhead running over silence.
test('a device still loading shows as loading on the others', async ({ page, browser, baseURL, library }) => {
  test.setTimeout(90_000);

  // Whatever an earlier test left playing is stopped and its devices dropped,
  // so that the page about to load is the one the record names.
  await page.goto('/');
  const headers = await authorization(page);
  await page.request.post('/api/player/devices', { headers, data: { deviceIds: [] } });

  // The playing device's stream never arrives, so the only thing that ends the
  // wait is the report it would send on its first sound, sent here instead.
  await page.route('**/api/tracks/*/stream?**', () => new Promise(() => {}));
  await page.goto(`/albums/${library.albums.Stellar}`);
  const add = page.getByRole('button', { name: 'Add', exact: true });
  if (await add.count()) {
    await add.click();
  }
  await expect.poll(() => playerState(page).then((state) => state.devices.length), { timeout: 15_000 }).toBe(1);

  // Another device, watching. It gets a browser context of its own: tabs of
  // one context share six connections, every tab holds two streams open, and
  // the playing device's held stream takes more. It hears of the record through
  // realtime, and it is listening once a change made now reaches it: the
  // repeat mode is one it shows, and one this test can put back.
  const other = await browser.newContext({ storageState: paths.authFile, baseURL, locale: 'en-US' });
  const watcher = await other.newPage();
  await watcher.goto('/');
  await expect
    .poll(
      async () => {
        await page.request.post('/api/player/repeat', { headers, data: { repeat: 'all' } });
        return watcher
          .getByRole('button', { name: 'Repeat playlist' })
          .first()
          .waitFor({ timeout: 1_000 })
          .then(
            () => true,
            () => false,
          );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.request.post('/api/player/repeat', { headers, data: { repeat: 'none' } });

  await page.getByRole('button', { name: 'Play Album' }).click();
  await expect.poll(() => playerState(page).then((state) => state.playing && state.waiting), { timeout: 15_000 }).toBe(true);
  await expect(watcher.getByRole('button', { name: 'Loading playback' }).first()).toBeVisible();

  // Nothing heard, nothing moved: neither the record nor what the watcher draws.
  const shown = () => watcher.getByRole('slider', { name: 'Seek playback position' }).first().getAttribute('aria-valuenow').then(Number);
  expect(await shown()).toBe(0);
  await watcher.waitForTimeout(2_000);
  expect(await shown()).toBe(0);
  const waiting = await playerState(page);
  expect(waiting.waiting).toBe(true);
  expect(waiting.position).toBe(0);

  await page.request.post('/api/player/position', { headers, data: { trackId: waiting.track, position: 0.5, cycle: Date.parse(waiting.beganAt) } });
  await expect.poll(() => playerState(page).then((state) => state.playing && !state.waiting), { timeout: 15_000 }).toBe(true);
  await expect(watcher.getByRole('button', { name: 'Pause' }).first()).toBeVisible();
  // And from the report on, the watcher counts the playhead on.
  await expect.poll(shown, { timeout: 10_000 }).toBeGreaterThan(1);

  await other.close();
  await page.request.post('/api/player/devices', { headers, data: { deviceIds: [] } });
});
