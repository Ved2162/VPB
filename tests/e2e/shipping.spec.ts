import { test, expect } from '@playwright/test';

for (const qty of [1, 60]) {
  test(`shipping is free and totals agree across cart, drawer and checkout for ${qty} reels`, async ({ page, context }) => {
    expect((await context.request.post('/api/auth', { data: { action: 'login', phone: '9000000112', password: 'E2e-only-password-2026' } })).ok()).toBe(true);
    await page.addInitScript((quantity) => {
      localStorage.setItem('vpb_cart', JSON.stringify([{ id: '20000000-0000-4000-8000-000000000001', slug: 'loader-test-manjha', name: 'Loader test manjha', price: 100, image: '/images/manjha/m01.png', qty: quantity, stock: 100 }]));
    }, qty);
    const total = qty === 1 ? '₹100' : '₹5,800';
    const main = page.getByRole('main');
    await page.goto('/cart');
    await expect(main.getByText('Shipping', { exact: true }).locator('..')).toContainText('FREE');
    await expect(page.getByText('FREE shipping on every order — no minimum spend.', { exact: true })).toBeVisible();
    await expect(main.getByText('Total', { exact: true }).locator('..')).toContainText(total);
    await page.getByRole('button', { name: 'Cart', exact: true }).click();
    const drawer = page.locator('aside');
    await expect(drawer.getByText('Shipping', { exact: true }).locator('..')).toContainText('FREE');
    await expect(drawer.getByText('Total', { exact: true }).locator('..')).toContainText(total);
    await drawer.getByRole('link', { name: 'Checkout', exact: true }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(main.getByText('Shipping', { exact: true }).locator('..')).toContainText('FREE');
    await expect(main.getByText('Total', { exact: true }).locator('..')).toContainText(total);
  });
}
