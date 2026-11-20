// End-to-end tests: the real app in a real browser, at desktop, tablet and phone sizes.
// Needs the app running (./bin/start-dev.sh), then: npm run test:e2e
// E2E_BASE_URL points it elsewhere; E2E_PASSWORD is the demo accounts' password (local default below).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '*.spec.js',
  // One at a time: LocalStack runs every request in its own container and falls over under parallel load.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // Tablet and phone sizes in Chromium (the browser installed here), with touch.
    { name: 'tablet', use: { ...devices['iPad (gen 7)'], browserName: 'chromium' } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
