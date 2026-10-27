import { expect, test } from '@playwright/test';

test('admin specifications survive reload, reorder and removal; responsive cards navigate without intercepting cart controls', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByRole('textbox', { name: 'Admin ID', exact: true }).fill('e2eadmin');
  await page.locator('input[name="password"]:visible').fill('E2e-only-password-2026');
  await page.getByRole('button', { name: 'Login to Dashboard' }).click();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Add Product', exact: true }).click();
  const modal = page.locator('.fixed:visible').filter({ has: page.getByRole('button', { name: 'Save Product' }) });
  await modal.locator('input').nth(0).fill('VAYUSHASTRA Sankal 8');
  await modal.locator('input').nth(3).fill('E2E-SPECS');
  await page.getByLabel('Variant / subtitle', { exact: true }).fill('4 REEL');
  await page.getByLabel('Length and reel details', { exact: true }).fill('4 Reels (4,000 meters)');
  for (const [label, value] of [['Base', 'Original Sankal 8 Cotton Thread'], ['Coating', '4-layer coating (Heavy Sharp & Finish)']]) {
    await page.getByRole('button', { name: 'Add specification', exact: true }).click();
    const count = await modal.locator('input[aria-label$=" label"]').count();
    await page.getByLabel(`Specification ${count} label`, { exact: true }).fill(label);
    await page.getByLabel(`Specification ${count} value`, { exact: true }).fill(value);
  }
  await page.getByRole('button', { name: 'Save Product' }).click();
  await expect(modal).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'E2E-SPECS' }).getByRole('button').first().click();
  await expect(page.getByLabel('Specification 1 value', { exact: true })).toHaveValue('Original Sankal 8 Cotton Thread');
  await page.getByRole('button', { name: 'Move specification 2 up', exact: true }).click();
  await page.getByRole('button', { name: 'Save Product' }).click();
  await expect(modal).toHaveCount(0);
  const data = await (await page.request.get('/api/products?q=Sankal%208')).json();
  const product = data.products.find((p: { sku: string }) => p.sku === 'E2E-SPECS');
  expect(product.specs[0].label).toBe('Coating');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/shop?q=Sankal%208');
    const card = page.locator(`[data-product-card="${product.id}"]`);
    await expect(card.getByText('Original Sankal 8 Cotton Thread', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await expect(page).toHaveURL(/\/shop/);
    await expect(page.getByRole('heading', { name: /Your Cart/ })).toBeVisible();
    await page.locator('aside').filter({ has: page.getByRole('heading', { name: /Your Cart/ }) }).locator('button').first().click();
    // Click a blank part covered by the semantic stretched product link.
    if (width === 1440) await card.click({ position: { x: 8, y: 8 } });
    else {
      const link = card.getByRole('link', { name: 'VAYUSHASTRA Sankal 8 (4 REEL)', exact: true });
      await link.focus();
      await expect(link).toBeFocused();
      await page.screenshot({ path: 'test-results/vpb-product-card-mobile.png', fullPage: true });
      await link.press('Enter');
    }
    await expect(page).toHaveURL(new RegExp('/product/' + product.slug + '$'));
    await expect(page.getByRole('heading', { name: 'VAYUSHASTRA Sankal 8 (4 REEL)', exact: true })).toBeVisible();
    await expect(page.getByText('4-layer coating (Heavy Sharp & Finish)', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'E2E-SPECS' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Remove specification 1', exact: true }).click();
  await page.getByRole('button', { name: 'Save Product' }).click();
  await expect(modal).toHaveCount(0);
  const detail = await (await page.request.get('/api/products/' + product.slug)).json();
  expect(detail.product.specs).toEqual([{ label: 'Base', value: 'Original Sankal 8 Cotton Thread' }]);
  const updated = await page.request.post('/api/admin', { data: { res: 'product', id: product.id, data: { name: 'VAYUSHASTRA Sankal 8 ' + 'long-name-'.repeat(16), specs: [{ label: 'Base', value: 'Cotton'.repeat(30) }] } } });
  expect(updated.ok()).toBe(true);
  await page.goto('/shop?q=E2E-SPECS');
  await expect(page.locator(`[data-product-card="${product.id}"]`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await page.request.post('/api/admin', { data: { res: 'product', id: product.id, data: { specs: [], length: '' } } })).ok()).toBe(true);
  await page.reload();
  await expect(page.locator(`[data-product-card="${product.id}"] dl`)).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'VPB trademark — Verai Patang Bhandar', exact: true })).toHaveCount(2);
  await expect(page.getByText('™', { exact: true })).toHaveCount(2);
  await page.screenshot({ path: 'test-results/vpb-branding-mobile.png', fullPage: true });
});
