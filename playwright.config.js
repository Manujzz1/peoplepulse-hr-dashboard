import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: true,
  reporter: 'list',
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
