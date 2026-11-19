import { defineConfig } from '@playwright/test';
import base from './playwright.config';
// Optional local runner when the Windows webServer teardown hangs: start
// scripts/e2e-server.mjs separately with a fresh disposable database first.
export default defineConfig({ ...base, webServer: { ...(base.webServer as object), reuseExistingServer: true } });
