import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// The suite runs against the real Go binary serving the built client, the same
// arrangement as production: one origin, no proxy, no mocks. It gets its own
// port and its own database directory so it can never touch the development
// server on :8090.
const address = process.env.E2E_ADDR ?? '127.0.0.1:8099';
const dataDir = process.env.E2E_DATA_DIR ?? path.resolve('e2e/.data');
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? `http://${address}`;

export const paths = {
  dataDir,
  authFile: path.join(dataDir, 'auth.json'),
};

export const account = {
  email: 'e2e@melody.test',
  password: 'e2e-password',
  superuser: { email: 'e2e-admin@melody.test', password: 'e2e-superuser' },
};

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.artifacts',
  // One server, one database, one signed-in account: the tests share state and
  // have to run in order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { outputFolder: 'e2e/.report', open: 'never' }]] : [['list']],
  use: {
    baseURL,
    // The interface follows the browser's language. Pinning it keeps a test
    // that matches on a label from depending on whoever runs it.
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: paths.authFile },
      dependencies: ['setup'],
    },
  ],
  // E2E_BASE_URL points the suite at a stack someone else started. It is the
  // escape hatch for debugging, not the normal path: whatever it points at gets
  // written to.
  webServer: external
    ? undefined
    : {
        command: 'e2e/serve.sh',
        url: `${baseURL}/api/health`,
        // The client is built before the server starts.
        timeout: 180_000,
        reuseExistingServer: false,
        // PocketBase logs every statement it runs; the failure output is
        // unreadable with it folded in.
        stdout: 'ignore',
        stderr: 'pipe',
        env: {
          E2E_ADDR: address,
          E2E_DATA_DIR: dataDir,
          E2E_SUPERUSER_EMAIL: account.superuser.email,
          E2E_SUPERUSER_PASSWORD: account.superuser.password,
        },
      },
});
