import type { Page } from '@playwright/test';

/**
 * A PCM silence the audio element can play: the seeded tracks point at files
 * that do not exist, and this stands in for one so the record stays playing
 * once it starts. Written by hand because the runners do not carry ffmpeg.
 */
export const SILENCE_WAV = (() => {
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
 * The signed-in user's credentials for a direct API call: the API answers
 * requests, not the browser, so the token the app keeps is handed over.
 */
export async function authorization(page: Page): Promise<{ Authorization: string }> {
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('pb_auth_melody-manager') ?? '{}').token ?? '');
  return { Authorization: `Bearer ${token}` };
}

/** Reads the playback record as the signed-in user. */
export async function playerState(page: Page): Promise<{ track: string; beganAt: string; devices: string[]; playing: boolean; waiting: boolean; position: number }> {
  const response = await page.request.get('/api/player', { headers: await authorization(page) });
  return response.json();
}
