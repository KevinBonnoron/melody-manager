import { playerState, SILENCE_WAV } from './support/playback';
import { expect, test } from './support/test';

// A device whose event stream drops is taken out of the playback set once the
// server's grace has passed. It is still the device in hand: it puts itself
// back when the stream is up again, and an order given from it reaches it.

test('a dropped device takes the playback back', async ({ page, library }) => {
  test.setTimeout(150_000);

  await page.route('**/api/tracks/*/stream?**', (route) => route.fulfill({ body: SILENCE_WAV, contentType: 'audio/wav' }));

  let blockEvents = false;
  await page.route('**/api/events', (route) => {
    if (blockEvents) {
      route.abort();
    } else {
      route.continue();
    }
  });

  await page.goto(`/albums/${library.albums.Stellar}`);
  const add = page.getByRole('button', { name: 'Add', exact: true });
  if (await add.count()) {
    await add.click();
  }

  // The page claims the playback as soon as it has read the record, and the
  // claim is kept even though nothing is playing yet.
  await expect.poll(() => playerState(page).then((state) => state.devices.length), { timeout: 15_000 }).toBe(1);

  // The device's event stream dies, the way a phone in a pocket's does. The
  // server holds its place for a grace and then takes it out.
  blockEvents = true;
  await page.waitForTimeout(40_000);

  // The stream comes back: the device puts itself back into the set.
  blockEvents = false;
  await expect.poll(() => playerState(page).then((state) => state.devices.length), { timeout: 30_000 }).toBe(1);

  // An order given from this device reaches it.
  await page.getByRole('button', { name: 'Play Album' }).click();
  await expect
    .poll(
      () =>
        playerState(page).then((state) => {
          return state.playing && state.devices.length === 1;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
});
