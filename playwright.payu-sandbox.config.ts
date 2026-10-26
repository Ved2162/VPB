import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Start scripts/e2e-server.mjs --payu-sandbox separately. Never target the
// production database or domain with this disposable-account test suite.
export default defineConfig({ ...base, testDir: './tests/sandbox', webServer: undefined,
  timeout: 180000, outputDir: 'test-results/payu-sandbox',
  use: { ...base.use, baseURL: 'http://127.0.0.1:3100', trace: 'off', screenshot: 'off', video: 'off' } });
