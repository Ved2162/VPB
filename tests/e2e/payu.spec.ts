import { test, expect } from '@playwright/test';

const orderId = '10000000-0000-4000-8000-000000000001';
test.beforeEach(async ({ page, context }) => {
  const login = await context.request.post('/api/auth', { data: { action: 'login', phone: '9000000120', password: 'E2e-only-password-2026' } });
  expect(login.ok()).toBe(true);
  await page.route('**/api/orders/' + orderId, route => route.fulfill({ json: { ok: true, order: { id: orderId, orderNumber: 'PAYU-BROWSER-FIXTURE', total: 100, subtotal: 100, discount: 0, shippingCharge: 0, paymentMethod: 'payu', paymentStatus: 'paid', orderStatus: 'confirmed' } } }));
  await page.addInitScript(() => {
    localStorage.setItem('vpb_cart', JSON.stringify([{ id: '20000000-0000-4000-8000-000000000001', slug: 'loader-test-manjha', name: 'Loader test manjha', price: 100, image: '/images/manjha/m01.png', qty: 1, stock: 25 }]));
  });
});

test('hosted checkout form posts to PayU and returns to server-verified order; refresh is safe', async ({ page }) => {
  // Browser transport fixtures only. No network request reaches a payment provider.
  let posted = '';
  await page.route('**/api/payment/create', route => route.fulfill({ json: { ok: true, orderId, action: 'https://test.payu.in/_payment',
    fields: { key: 'browser-fixture', txnid: 'a'.repeat(24), amount: '100.00', hash: 'fixture-hash' } } }));
  await page.route('https://test.payu.in/_payment', async route => {
    posted = route.request().postData() || '';
    await route.fulfill({ status: 303, headers: { location: 'http://127.0.0.1:3100/checkout?paymentOrder=' + orderId }, body: '' });
  });
  await page.route('**/api/payment/payu/verify', route => route.fulfill({ json: { ok: true, orderId, paymentStatus: 'paid' } }));
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Continue to Payment', exact: true }).click();
  await page.getByLabel('Payment email').fill('fixture@example.com');
  await page.getByRole('button', { name: /^Pay / }).click();
  await expect(page.getByRole('heading', { name: 'Order Confirmed!', exact: true })).toBeVisible();
  expect(new URLSearchParams(posted).get('txnid')).toBe('a'.repeat(24));
  expect(new URLSearchParams(posted).get('amount')).toBe('100.00');
  expect(posted).not.toContain('salt');
  expect(await page.evaluate(() => sessionStorage.getItem('vpb-payu-order'))).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Order Confirmed!', exact: true })).toHaveCount(0);
});

test('pending return and refresh never display confirmation; a later verified capture completes the order', async ({ page }) => {
  let status = 'pending';
  await page.route('**/api/payment/payu/verify', route => route.fulfill({ json: { ok: true, orderId, paymentStatus: status } }));
  await page.goto('/checkout?paymentOrder=' + orderId);
  await expect(page.getByText(/Payment is awaiting confirmation/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Order Confirmed!', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Check payment status', exact: true })).toBeVisible();
  status = 'paid';
  await page.getByRole('button', { name: 'Check payment status', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Order Confirmed!', exact: true })).toBeVisible();
});

test('cancelled payment offers retry on the same order; verification errors never display success', async ({ page }) => {
  let failed = true;
  await page.route('**/api/payment/payu/verify', route => route.fulfill(failed
    ? { json: { ok: true, orderId, paymentStatus: 'failed' } }
    : { status: 400, json: { ok: false, error: 'Payment verification failed' } }));
  await page.goto('/checkout?paymentOrder=' + orderId);
  await expect(page.getByRole('button', { name: 'Retry payment', exact: true })).toBeVisible();
  let retriedOrder = '';
  await page.route('**/api/payment/retry', async route => {
    retriedOrder = route.request().postDataJSON().orderId;
    await route.fulfill({ status: 503, json: { ok: false, error: 'PayU verification is temporarily unavailable' } });
  });
  await page.getByRole('button', { name: 'Retry payment', exact: true }).click();
  await expect(page.getByText('PayU verification is temporarily unavailable', { exact: true })).toBeVisible();
  expect(retriedOrder).toBe(orderId);
  failed = false;
  await page.reload();
  await expect(page.getByText('Payment verification failed', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Order Confirmed!', exact: true })).toHaveCount(0);
});
