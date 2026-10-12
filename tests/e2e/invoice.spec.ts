import { test, expect } from '@playwright/test';

test('customer desktop/mobile invoice download, protected link and confirmed/cancelled sharing paths', async ({ page }) => {
  const login = await page.request.post('/api/auth', { data: { action: 'login', phone: '9000000102', password: 'E2e-only-password-2026' } });
  expect(login.ok()).toBe(true);
  await page.goto('/account');
  const button = page.getByRole('button', { name: 'Download Invoice (PDF)', exact: true }).first();
  await expect(button).toBeVisible();
  const download = page.waitForEvent('download'); await button.click();
  expect((await download).suggestedFilename()).toMatch(/^VPB-\d{4}-\d{2}-\d{6}\.pdf$/);
  await expect(page.getByText('Preparing invoice…')).toHaveCount(0);
  const share = page.getByRole('button', { name: 'Share Invoice', exact: true }).first();
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }));
  await share.click();
  await expect(page.getByText(/The link requires the order owner/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy secure link' })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      if (!data.files?.length || data.files[0].type !== 'application/pdf') throw new Error('Missing PDF file');
    } });
  });
  // Test doubles exercise browser branches, not actual device/WhatsApp sharing.
  await share.click(); await expect(page.getByText('Invoice shared.', { exact: true })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'AbortError'); } }));
  await share.click(); await expect(page.getByText('Invoice shared.', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(button).toBeVisible();
  const mobile = page.waitForEvent('download'); await button.click(); expect((await mobile).suggestedFilename()).toContain('VPB-');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/invoice-mobile.png', fullPage: true });
});
