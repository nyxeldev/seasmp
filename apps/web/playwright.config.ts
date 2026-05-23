import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    process.env.CI ? ['github'] : ['list'],
  ],
  use: {
    baseURL:            process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace:              'on-first-retry',
    screenshot:         'only-on-failure',
    video:              'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: '**/global.setup.ts' },
    {
      name:         'chromium',
      use:          { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name:         'firefox',
      use:          { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },
    {
      name:         'Mobile Chrome',
      use:          { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command:            'npm run dev',
        url:                'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout:            120_000,
      },
})
