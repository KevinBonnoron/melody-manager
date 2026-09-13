import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { account, paths } from '../../playwright.config';
import { AdminApi } from './api';

// What the seed created, so a test can reach an album by name rather than by
// clicking its way to one and hoping the order held.
export interface SeededLibrary {
  artists: Record<string, string>;
  albums: Record<string, string>;
}

export const seedFile = path.join(paths.dataDir, 'seed.json');

// A library small enough to reason about and varied enough to be worth
// browsing: two artists, two albums, one of them credited to both, and tracks
// under each.
export const library = {
  artists: ['Couple N', 'Ulchero'],
  albums: [
    { name: 'Stellar', year: 2024, artists: ['Couple N'], tracks: ['Stella Magica', 'Thank You Summer'] },
    { name: 'Matsuri', year: 2023, artists: ['Couple N', 'Ulchero'], tracks: ['Matsuri'] },
  ],
} as const;

export async function seed(baseURL: string) {
  const api = new AdminApi(baseURL);
  await api.signIn();
  await seedUser(api);
  const seeded = await seedLibrary(api);

  await mkdir(paths.dataDir, { recursive: true });
  await writeFile(seedFile, JSON.stringify(seeded, null, 2));
  return seeded;
}

// The first account created becomes the administrator, which is what the suite
// signs in as: an admin sees every screen, so one account covers them all.
async function seedUser(api: AdminApi) {
  const existing = await api.first('users', `email = "${account.email}"`);
  if (existing) {
    return;
  }

  const user = await api.create('users', {
    email: account.email,
    password: account.password,
    passwordConfirm: account.password,
    name: 'E2E',
    // Onboarding is a screen of its own with its own test; every other test
    // starts past it.
    onboardingDone: true,
  });
  await api.update('users', user.id as string, { onboardingDone: true, verified: true });
}

async function seedLibrary(api: AdminApi): Promise<SeededLibrary> {
  const seeded: SeededLibrary = { artists: {}, albums: {} };

  for (const name of library.artists) {
    const existing = await api.first('artists', `name = "${name}"`);
    const artist = existing ?? (await api.create('artists', { name }));
    seeded.artists[name] = artist.id as string;
  }

  for (const album of library.albums) {
    const artists = album.artists.map((name) => seeded.artists[name]);
    const existing = await api.first('albums', `name = "${album.name}"`);
    const record = existing ?? (await api.create('albums', { name: album.name, year: album.year, artists }));
    seeded.albums[album.name] = record.id as string;
    if (existing) {
      continue;
    }

    for (const title of album.tracks) {
      await api.create('tracks', {
        title,
        duration: 210,
        origin: `file:///e2e/${album.name}/${title}.flac`,
        source: 'local',
        availability: 'file',
        artists,
        album: record.id,
      });
    }
  }

  return seeded;
}
