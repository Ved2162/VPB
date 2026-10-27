import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('responsive images are smaller and cacheable; hidden hover images wait for interaction', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByRole('textbox', { name: 'Admin ID', exact: true }).fill('e2eadmin');
  await page.locator('input[name="password"]:visible').fill('E2e-only-password-2026');
  await page.getByRole('button', { name: 'Login to Dashboard' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const originals = await Promise.all(['m01.png', 'm02.png'].map(file => readFile('public/images/manjha/' + file)));
  const images: string[] = [];
  for (const original of originals) {
    const response = await page.request.post('/api/admin/images', { data: original, headers: { 'Content-Type': 'image/png' } });
    expect(response.ok()).toBe(true);
    images.push((await response.json()).url);
  }
  const saved = await page.request.post('/api/admin', { data: { res: 'product', data: { name: 'Responsive image manjha', sku: 'PERF-MANJHA', price: 1234, stockQuantity: 9, images } } });
  expect(saved.ok()).toBe(true);
  const { id } = await saved.json();
  const requested: string[] = [];
  page.on('request', request => requested.push(request.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  const thumbnail = page.waitForResponse(response => response.url().includes(images[0] + '?w='));
  await page.goto('/shop?q=PERF-MANJHA');
  const response = await thumbnail;
  expect(response.headers()['content-type']).toBe('image/webp');
  expect(response.headers()['cache-control']).toContain('immutable');
  expect(response.headers()['cache-control']).not.toContain('no-store');
  expect((await response.body()).length).toBeLessThan(originals[0].length / 2);
  const card = page.locator(`[data-product-card="${id}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toHaveCount(1);
  expect(requested.some(url => url.includes(images[1]))).toBe(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const hoverImage = page.waitForResponse(response => response.url().includes(images[1] + '?w='));
  await card.hover();
  expect((await hoverImage).ok()).toBe(true);
  await expect(card.locator('img')).toHaveCount(2);
  await card.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Your Cart/ })).toBeVisible();
  await expect(page).toHaveURL(/\/shop/);
});

test('reduced motion keeps video posters without starting large video downloads', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('video')).toHaveAttribute('preload', 'none');
  await expect(page.locator('video')).not.toHaveAttribute('src');
  await page.goto('/craftsmanship');
  await expect(page.locator('video')).not.toHaveAttribute('src');
});
