import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: ['**/api/**'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: ['**/api/**'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: ['**/api/**'],
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testIgnore: ['**/api/**'],
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
      testIgnore: ['**/api/**'],
    },
    // ── API Contract Tests ────────────────────────────────────────────────
    // Runs direct HTTP requests against the backend (no browser / no frontend).
    // Set API_BASE_URL env var to point at any running backend instance.
    // Example: API_BASE_URL=http://localhost:9000 bunx playwright test --project=api-contracts
    {
      name: 'api-contracts',
      testDir: './e2e/api',
      // Run files sequentially to avoid overwhelming Cognito's rate limiter
      // with concurrent login requests from multiple workers.
      fullyParallel: false,
      use: {
        baseURL: process.env.API_BASE_URL ?? 'http://localhost:9000',
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 8080',
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
