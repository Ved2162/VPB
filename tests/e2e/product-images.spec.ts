import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('admin selects and drops images, then saves and reopens a product', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByRole('textbox', { name: 'Admin ID', exact: true }).fill('e2eadmin');
  await page.locator('input[name="password"]:visible').fill('E2e-only-password-2026');
  await page.getByRole('button', { name: 'Login to Dashboard' }).click();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Add Product' }).click();
  const modal = page.locator('.fixed:visible').filter({ has: page.getByRole('button', { name: 'Save Product' }) });
  await modal.locator('input').nth(0).fill('Uploaded image kite');
  await modal.locator('input').nth(3).fill('E2E-IMAGE-KITE');
  await page.getByLabel('Choose product images').setInputFiles('public/images/manjha/m01.png');
  await expect(page.getByAltText('Product image 1', { exact: true })).toBeVisible();
  const bytes = await readFile('public/images/manjha/m02.png');
  const transfer = await page.evaluateHandle(base64 => {
    const raw = atob(base64);
    const file = new File([Uint8Array.from(raw, c => c.charCodeAt(0))], 'dropped.png', { type: 'image/png' });
    const data = new DataTransfer(); data.items.add(file); return data;
  }, bytes.toString('base64'));
  await page.getByText('or drag and drop images here').locator('..').dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.getByAltText('Product image 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Product' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save Product' }).click();
  await expect(modal).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Uploaded image kite' });
  await expect(row).toBeVisible();
  await row.getByRole('button').first().click();
  await expect(page.getByAltText('Product image 2', { exact: true })).toBeVisible();
  const imageUrls = (await page.getByLabel('Image URLs (one per line)').inputValue()).split('\n');
  for (const url of imageUrls) {
    const image = await page.request.get(url);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/png');
  }
  const storefront = await page.request.get('/api/products?q=Uploaded%20image%20kite');
  expect((await storefront.json()).products[0].images).toEqual(imageUrls);
});
