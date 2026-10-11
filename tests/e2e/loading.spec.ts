import { expect, test, type Page } from '@playwright/test';

function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
test('fast refresh finishes before the display threshold and keeps the catalog visible', async ({ page }) => {
  await page.goto('/shop');
  await expect(page.getByText('Loader test kite', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.vpb-request-activity')).toHaveCount(0);
  await page.route('**/api/products?**', route => route.fulfill({ json: { ok: true, products: [], total: 0 } }));
  await page.evaluate(() => {
    const samples: number[] = [];
    Object.assign(window, { loaderSamples: samples });
    const until = performance.now() + 150;
    const sample = () => {
      const loader = document.querySelector('.vpb-loader:not(.vpb-overlay-content)');
      if (loader) samples.push(Number(getComputedStyle(loader).opacity));
      if (performance.now() < until) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    (Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Search'))?.click();
  });
  await expect(page.getByText('No products found', { exact: true })).toBeVisible();
  await expect(page.locator('.vpb-request-activity')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { loaderSamples: number[] }).loaderSamples.every(value => value === 0))).toBe(true);
  await expect(page.locator('.vpb-global-loader')).toHaveCount(0);
});
async function seedCart(page: Page) {
  await page.addInitScript(() => localStorage.setItem('vpb_cart', JSON.stringify([{ id: '20000000-0000-4000-8000-000000000001', slug: 'loader-test-kite', name: 'Loader test kite', price: 100, image: '/images/manjha/m01.png', qty: 1, stock: 25 }])));
}
test('catalog loader uses the circular VPB mark, handles failure/retry, preserves data on refresh', async ({ page }) => {
  const slow = gate(); let first = true;
  await page.route('**/api/products?**', async route => {
    if (route.request().url().includes('limit=5')) { await route.continue(); return; }
    if (first) { first = false; await slow.promise; await route.fulfill({ status: 503, json: { ok: false, error: 'Catalog connection interrupted' } }); }
    else await route.continue();
  });
  await page.goto('/shop');
  const section = page.locator('.vpb-loader').filter({ hasText: 'Loading products' });
  await expect(section).toBeVisible();
  await expect(section.locator('.vpb-loader-wordmark')).toHaveText('VPB');
  await expect(page.locator('.vpb-skeleton')).toBeVisible();
  slow.release();
  await expect(page.getByRole('alert').filter({ hasText: 'Catalog connection interrupted' }).first()).toBeVisible();
  await expect(section).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry', exact: true }).first().click();
  await expect(page.getByText('Loader test kite', { exact: true }).first()).toBeVisible();
  const refresh = gate();
  await page.route('**/api/products?**', async route => { await refresh.promise; await route.continue(); });
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Loader test kite', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.vpb-global-loader')).toHaveCount(0);
  refresh.release();
  await expect(page.locator('.vpb-request-activity')).toHaveCount(0);
});
test('independent concurrent dashboard requests keep activity until both finish', async ({ page, context }) => {
  await context.request.post('/api/admin/login', { data: { username: 'e2eadmin', password: 'E2e-only-password-2026' } });
  const metadata = gate(), shipments = gate();
  await page.route('**/api/delivery/settings', async route => { await metadata.promise; await route.continue(); });
  await page.route('**/api/delivery/shipments?**', async route => { await shipments.promise; await route.continue(); });
  await page.goto('/delivery');
  await expect(page.locator('.vpb-request-activity')).toContainText('requests in progress');
  await expect(page.locator('.vpb-loader').filter({ hasText: 'Loading shipments' }).filter({ visible: true })).toBeVisible();
  metadata.release();
  await expect(page.locator('.vpb-request-activity')).toContainText('Updating shipment information');
  shipments.release();
  await expect(page.getByRole('heading', { name: '23 shipments', exact: true })).toBeVisible();
  await expect(page.locator('.vpb-request-activity')).toHaveCount(0);
});
test('product, account, cart and checkout use bounded section/button loading without blocking local updates', async ({ page, context }) => {
  const product = gate();
  await page.route('**/api/products/loader-test-kite', async route => { await product.promise; await route.continue(); });
  await page.goto('/product/loader-test-kite');
  await expect(page.getByRole('status').filter({ hasText: 'Loading product details' })).toBeVisible();
  product.release();
  await expect(page.getByRole('heading', { name: 'Loader test kite', exact: true })).toBeVisible();
  await context.request.post('/api/auth', { data: { action: 'login', phone: '9000000102', password: 'E2e-only-password-2026' } });
  const orders = gate();
  await page.route('**/api/orders', async route => { await orders.promise; await route.continue(); });
  await page.goto('/account');
  await expect(page.getByRole('status').filter({ hasText: 'Loading your orders' }).first()).toBeVisible();
  orders.release();
  await expect(page.getByText('E2E-001', { exact: true })).toBeVisible();
  await seedCart(page);
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: /Your Cart/ }).first()).toBeVisible();
  await expect(page.locator('.vpb-global-loader')).toHaveCount(0);
  await page.goto('/checkout');
  await expect(page.getByText('Step 3', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Payment' }).click();
  const payment = gate();
  await page.route('**/api/payment/create', async route => { await payment.promise; await route.fulfill({ status: 503, json: { ok: false, error: 'Payment connection interrupted' } }); });
  const pay = page.getByRole('button', { name: /^Pay ₹/ });
  await pay.click();
  await expect(page.getByRole('button', { name: 'Processing payment…' })).toBeDisabled();
  await expect(page.locator('.vpb-global-loader')).toHaveCount(0);
  payment.release();
  await expect(pay).toBeEnabled();
  await expect(page.locator('.vpb-request-activity')).toHaveCount(0);
});
test('mobile reduced motion, dark circular mark and browser history remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const slow = gate();
  await page.route('**/api/products/loader-test-kite', async route => { await slow.promise; await route.continue(); });
  await page.goto('/about');
  await page.goto('/product/loader-test-kite');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect(page.locator('.vpb-loader-wordmark').first()).toBeVisible();
  expect(await page.locator('.vpb-loader').first().evaluate(el => getComputedStyle(el).color)).toBe('rgb(240, 217, 168)');
  expect(await page.locator('.vpb-loader-ring').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/loader-mobile.png', fullPage: true });
  slow.release();
  await expect(page.getByRole('heading', { name: 'Loader test kite', exact: true })).toBeVisible();
  await page.goBack(); await expect(page).toHaveURL(/\/about$/);
  await page.goForward(); await expect(page).toHaveURL(/\/product\/loader-test-kite$/);
  await expect(page.getByRole('heading', { name: 'Loader test kite', exact: true })).toBeVisible();
});


test('initial overlay is centered, blurred and exclusive across viewport sizes; completion restores interaction', async ({ page }) => {
  const auth = gate(), products = gate();
  await page.route('**/api/auth', async route => { await auth.promise; await route.continue(); });
  await page.route('**/api/products?**', async route => { await products.promise; await route.continue(); });
  await page.goto('/shop');
  const overlay = page.locator('.vpb-global-loader');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCount(1);
  await expect(overlay).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.vpb-loader').filter({ hasText: 'Loading products' })).toBeHidden();
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const mark = await overlay.locator('.vpb-loader-circle').boundingBox();
    expect(Math.abs(mark!.x + mark!.width / 2 - viewport.width / 2)).toBeLessThan(1);
    expect(Math.abs(mark!.y + mark!.height / 2 - viewport.height / 2)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const styles = await overlay.evaluate(el => ({ blur: getComputedStyle(el).backdropFilter, surface: getComputedStyle(el).backgroundColor, fixed: getComputedStyle(el).position }));
  expect(styles).toEqual({ blur: 'blur(4px)', surface: 'rgba(255, 250, 240, 0.72)', fixed: 'fixed' });
  const wordmark = overlay.locator('.vpb-loader-wordmark');
  expect(await wordmark.evaluate(el => getComputedStyle(el).transform)).toBe('none');
  const ring = overlay.locator('.vpb-loader-ring');
  const rotation = await ring.evaluate(el => getComputedStyle(el).transform);
  await expect.poll(() => ring.evaluate(el => getComputedStyle(el).transform)).not.toBe(rotation);
  expect(await page.locator('main').evaluate(el => (el as HTMLElement).inert)).toBe(true);
  await page.screenshot({ path: 'test-results/circular-overlay-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/circular-overlay-desktop.png' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(await overlay.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(28, 15, 10, 0.76)');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await ring.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  auth.release();
  await expect(overlay).toHaveCount(0);
  expect(await page.locator('main').evaluate(el => (el as HTMLElement).inert)).toBe(false);
  await expect(page.locator('.vpb-loader').filter({ hasText: 'Loading products' })).toBeVisible();
  products.release();
  await expect(page.getByText('Loader test kite', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.vpb-request-activity')).toHaveCount(0);
  await expect(page.locator('.vpb-loader-origami, .vpb-loader-thread, .vpb-loader-logo')).toHaveCount(0);
});

test('initial authentication failure clears the overlay and restores background controls', async ({ page }) => {
  const auth = gate();
  await page.route('**/api/auth', async route => { await auth.promise; await route.abort('failed'); });
  await page.goto('/shop');
  await expect(page.locator('.vpb-global-loader')).toBeVisible();
  auth.release();
  await expect(page.locator('.vpb-global-loader')).toHaveCount(0);
  expect(await page.locator('main').evaluate(el => (el as HTMLElement).inert)).toBe(false);
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
});


test('an initial request that never responds reaches its existing deadline and releases the overlay', async ({ page }) => {
  const auth = gate();
  await page.route('**/api/auth', async route => { await auth.promise; await route.fulfill({ json: { user: null } }).catch(() => {}); });
  await page.goto('/shop');
  await expect(page.locator('.vpb-global-loader')).toBeVisible();
  await expect(page.locator('.vpb-global-loader')).toHaveCount(0, { timeout: 12000 });
  expect(await page.locator('main').evaluate(el => (el as HTMLElement).inert)).toBe(false);
  await expect(page.locator('.vpb-request-activity')).toHaveCount(0);
  auth.release();
});
