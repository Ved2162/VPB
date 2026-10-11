import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({
  testDir: './tests/e2e', workers: 1, timeout: 120000,
  expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:3100', actionTimeout: 15000, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node scripts/e2e-server.mjs', url: 'http://127.0.0.1:3100/delivery/login', timeout: 120000, reuseExistingServer: false },
});
