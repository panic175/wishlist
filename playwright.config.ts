import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx next dev -p 3100',
    port: 3100,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'e2e-pass',
      // localhost is a secure context in Chromium, so Secure cookies work over
      // plain HTTP here - which is required for the Authelia header (only
      // honored on TLS-terminated connections) to mint a session.
      COOKIE_SECURE: 'true',
      WISHLIST_DB_PATH: './data/db/e2e.db',
      AUTHELIA_ENABLED: 'true',
      AUTHELIA_USER_HEADER: 'X-Forwarded-User',
      AUTHELIA_PORTAL_URL: 'https://auth.example.com',
    },
  },
});