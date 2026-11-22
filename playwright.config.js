import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  webServer: process.env.PEOPLEPULSE_E2E_MANAGED === '1' ? undefined : {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    // Browser tests must never pick up a developer's local Supabase project.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    channel: process.platform === 'win32' ? 'chrome' : undefined,
    headless: true,
    launchOptions: {
      args: ['--no-sandbox'],
    },
  },
})
