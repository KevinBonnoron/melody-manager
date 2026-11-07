import { readFile } from 'node:fs/promises';
import { test as base } from '@playwright/test';
import { type SeededLibrary, seedFile } from './seed';

// Every test gets the seeded library by name, so none of them has to navigate
// blind or depend on the order records come back in.
export const test = base.extend<{ library: SeededLibrary }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the destructuring pattern to work out which other fixtures this one needs, and this one needs none
  library: async ({}, use) => {
    await use(JSON.parse(await readFile(seedFile, 'utf-8')) as SeededLibrary);
  },
});

export { expect } from '@playwright/test';
