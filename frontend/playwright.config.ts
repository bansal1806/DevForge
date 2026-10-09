import { defineConfig, devices } from '@playwright/test'

const PORT = 5299
const CI = !!process.env.CI

/**
 * End-to-end tests run the real frontend (Vite dev server) against mocked
 * /api routes and a fake Supabase project — no backend, database or network.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
    // Real env vars take precedence over .env files in Vite
    env: {
      VITE_API_BASE_URL: '/api',
      VITE_SUPABASE_URL: 'https://e2e-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
      VITE_ENABLE_REALTIME: 'false',
    },
  },
})
