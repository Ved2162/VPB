import { test, expect } from '@playwright/test';

test('multilingual review moderation, safe HTML text rendering and revoked-cookie rejection', async ({ browser }) => {
  const baseURL = 'http://127.0.0.1:3100';
  const customer = await browser.newContext({ baseURL });
  const admin = await browser.newContext({ baseURL });
  const visitor = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    expect((await customer.request.post('/api/auth', { data: { action: 'login', phone: '9000000110', password: 'E2e-only-password-2026' } })).ok()).toBe(true);
    const page = await customer.newPage(); await page.goto('/product/loader-test-manjha');
    const feedback = '<img src=x onerror="window.__reviewXss=true"> Manjha ni quality sari che.';
    await page.getByRole('button', { name: '4 stars', exact: true }).click();
    await page.getByLabel('Language', { exact: true }).selectOption('gu-Latn');
    await page.getByLabel('Review title', { exact: true }).fill('Audit review');
    await page.getByLabel('Review text', { exact: true }).fill(feedback);
    await page.getByRole('button', { name: 'Submit Review', exact: true }).click();
    await expect(page.getByText('Review submitted for moderation. Thank you!', { exact: true })).toBeVisible();
    const before = await (await visitor.request.get('/api/products/loader-test-manjha')).json();
    expect(before.product.reviewCount).toBe(0); expect(before.reviews).toHaveLength(0);
    expect((await admin.request.post('/api/admin/login', { data: { username: 'e2eadmin', password: 'E2e-only-password-2026' } })).ok()).toBe(true);
    const moderator = await admin.newPage(); await moderator.goto('/admin');
    await moderator.getByRole('button', { name: 'Reviews', exact: true }).click();
    await moderator.locator('.card').filter({ hasText: 'Audit review' }).getByRole('button', { name: 'Approve', exact: true }).click();
    await expect.poll(async () => (await (await visitor.request.get('/api/products/loader-test-manjha')).json()).product.reviewCount).toBe(1);
    const publicPage = await visitor.newPage(); await publicPage.goto('/product/loader-test-manjha');
    await expect(publicPage.getByText(feedback, { exact: true })).toBeVisible();
    expect(await publicPage.locator('img[src="x"]').count()).toBe(0);
    expect(await publicPage.evaluate(() => (window as unknown as { __reviewXss?: boolean }).__reviewXss)).toBeUndefined();
    expect(await publicPage.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const copied = (await customer.cookies()).find(c => c.name === 'vpb_token')!;
    expect((await customer.request.delete('/api/auth')).ok()).toBe(true);
    expect((await customer.request.get('/api/extra?res=addresses', { headers: { cookie: 'vpb_token=' + copied.value } })).status()).toBe(401);
    expect((await customer.request.post('/api/auth', { data: { action: 'login', phone: '9000000110', password: 'E2e-only-password-2026' } })).ok()).toBe(true);
    expect((await customer.request.get('/api/extra?res=addresses')).status()).toBe(200);
  } finally { await Promise.all([customer.close(), admin.close(), visitor.close()]); }
});

test('a captured payment on stock hold is not presented as a confirmed order', async ({ page, context }) => {
  await context.request.post('/api/auth', { data: { action: 'login', phone: '9000000111', password: 'E2e-only-password-2026' } });
  await page.addInitScript(() => {
    localStorage.setItem('vpb_cart', JSON.stringify([{ id: '20000000-0000-4000-8000-000000000001', slug: 'loader-test-manjha', name: 'Loader test manjha', price: 100, image: '/images/manjha/m01.png', qty: 1, stock: 25 }]));
    window.Razorpay = class {
      constructor(public options: { handler: (receipt: object) => void }) {}
      on() {}
      open() { this.options.handler({ razorpay_order_id: 'order_hold', razorpay_payment_id: 'pay_hold', razorpay_signature: 'fixture-only' }); }
    };
  });
  // All gateway responses are local test doubles. Real credentials are disabled.
  await page.route('https://checkout.razorpay.com/**', route => route.abort());
  await page.route('**/api/payment/create', route => route.fulfill({ json: { ok: true, keyId: 'rzp_test_fixture', order: { id: 'order_hold', amount: 19900, currency: 'INR' } } }));
  await page.route('**/api/payment/verify', route => route.fulfill({ json: { ok: true, orderId: '10000000-0000-4000-8000-000000000001' } }));
  await page.route('**/api/orders/10000000-0000-4000-8000-000000000001', route => route.fulfill({ json: { ok: true, order: { id: '10000000-0000-4000-8000-000000000001', orderNumber: 'FIXTURE-HOLD', total: 199, paymentMethod: 'razorpay', paymentStatus: 'paid', orderStatus: 'placed', fulfillmentPending: true } } }));
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Continue to Payment', exact: true }).click();
  await page.getByRole('button', { name: /^Pay / }).click();
  await expect(page.getByRole('heading', { name: 'Payment Received', exact: true })).toBeVisible();
  await expect(page.getByText('Order Confirmed!', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/review your order before confirming fulfillment/)).toBeVisible();
});

test('production headers, secure cookies and disabled unused image proxy are enforced locally', async ({ request, context }) => {
  const response = await request.get('/');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['content-security-policy']).toContain("object-src 'none'");
  expect((await request.get('/.env')).status()).toBe(404);
  expect([400,404]).toContain((await request.get('/_next/image?url=%2Fimages%2Fmanjha%2Fm01.png&w=640&q=75')).status());
  const login = await context.request.post('/api/auth', { data: { action: 'login', phone: '9000000112', password: 'E2e-only-password-2026' } });
  expect(login.ok()).toBe(true);
  const session = (await context.cookies()).find(c => c.name === 'vpb_token')!;
  expect(session.httpOnly).toBe(true); expect(session.secure).toBe(true); expect(session.sameSite).toBe('Lax');
  expect((await context.request.get('/api/auth')).headers()['cache-control']).toContain('no-store');
});
