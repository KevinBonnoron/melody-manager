import type { Page } from '@playwright/test';
import { expect, test } from './support/test';

// A device whose event stream drops is taken out of the playback set once the
// server's grace has passed. It is still the device in hand: it puts itself
// back when the stream is up again, and an order given from it reaches it.

/**
 * A PCM silence the audio element can play: the seeded tracks point at files
 * that do not exist, and this stands in for one so the record stays playing
 * once it starts. Written by hand because the runners do not carry ffmpeg.
 * The point is the set, not the sound.
 */
const SILENCE_WAV = (() => {
  const seconds = 30;
  const rate = 44_100;
  const data = Buffer.alloc(seconds * rate * 2);
  const wav = Buffer.alloc(44 + data.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + data.length, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(data.length, 40);
  data.copy(wav, 44);
  return wav;
})();

/**
 * Reads the playback record as the signed-in user: the API answers requests,
 * not the browser, so the token the app keeps is handed over explicitly.
 */
async function playerState(page: Page): Promise<{ devices: string[]; playing: boolean }> {
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('pb_auth_melody-manager') ?? '{}').token ?? '');
  const response = await page.request.get('/api/player', { headers: { Authorization: `Bearer ${token}` } });
  return response.json();
}

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
