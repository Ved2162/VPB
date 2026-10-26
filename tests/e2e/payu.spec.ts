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
  await expect(page.getByLabel('Email address', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue to Payment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Order Confirmed!', exact: true })).toBeVisible();
  expect(new URLSearchParams(posted).get('txnid')).toBe('a'.repeat(24));
  expect(new URLSearchParams(posted).get('amount')).toBe('100.00');
  expect(posted).not.toContain('salt');
  expect(await page.evaluate(() => sessionStorage.getItem('vpb-payu-order'))).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Order Confirmed!', exact: true })).toHaveCount(0);
});

test('a missing email is saved with delivery details once and payment opens PayU directly', async ({ page, context }) => {
  await context.clearCookies();
  const login = await context.request.post('/api/auth', { data: { action: 'login', phone: '9000000121', password: 'E2e-only-password-2026' } });
  expect(login.ok()).toBe(true);
  expect((await context.request.post('/api/extra', { data: { res: 'address', name: 'New checkout customer', phone: '9000000121',
    addressLine: 'Test street', city: 'Bareilly', state: 'Uttar Pradesh', pincode: '243001', isDefault: true } })).ok()).toBe(true);
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /Step 2/ })).toBeVisible();
  await page.getByLabel('Email address', { exact: true }).fill('newcustomer@example.com');
  await page.getByRole('button', { name: 'Use selected address', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Step 3/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Step 3/ })).toBeVisible();
  await expect(page.getByLabel('Email address', { exact: true })).toHaveCount(0);
  let created = 0;
  await page.route('**/api/payment/create', async route => {
    created++;
    expect(route.request().postDataJSON().email).toBe('newcustomer@example.com');
    await route.fulfill({ json: { ok: true, orderId, action: 'https://test.payu.in/_payment', fields: { txnid: 'c'.repeat(24), email: 'newcustomer@example.com' } } });
  });
  await page.route('https://test.payu.in/_payment', route => route.fulfill({ contentType: 'text/html', body: '<h1>Direct PayU checkout fixture</h1>' }));
  await page.getByRole('button', { name: 'Continue to Payment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Direct PayU checkout fixture', exact: true })).toBeVisible();
  expect(created).toBe(1);
});

test('pending return and refresh never display confirmation; a later verified capture completes the order', async ({ page }) => {
  let status = 'pending';
  await page.route('**/api/payment/payu/verify', route => route.fulfill({ json: { ok: true, orderId, paymentStatus: status } }));
  await page.goto('/checkout?paymentOrder=' + orderId);
  await expect(page.getByText(/PayU has not confirmed a final payment result yet/)).toBeVisible();
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

test('an open checkout explains pending state and offers a fresh attempt after verified cancellation', async ({ page }) => {
  let cancelled = false;
  await page.route('**/api/payment/payu/verify', route => route.fulfill({ json: {
    ok: true, orderId, paymentStatus: cancelled ? 'failed' : 'pending', providerState: cancelled ? 'usercancelled' : 'initiated',
  } }));
  await page.goto('/checkout?paymentOrder=' + orderId);
  await expect(page.getByText(/This checkout is still open at PayU/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry payment', exact: true })).toHaveCount(0);
  cancelled = true;
  await page.getByRole('button', { name: 'Check payment status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry payment', exact: true })).toBeVisible();
  let retriedOrder = '', postedId = '';
  await page.route('**/api/payment/retry', async route => {
    retriedOrder = route.request().postDataJSON().orderId;
    await route.fulfill({ json: { ok: true, orderId, action: 'https://test.payu.in/_payment', fields: { txnid: 'b'.repeat(24), amount: '100.00' } } });
  });
  await page.route('https://test.payu.in/_payment', async route => {
    postedId = new URLSearchParams(route.request().postData() || '').get('txnid') || '';
    await route.fulfill({ contentType: 'text/html', body: '<h1>PayU fixture checkout</h1>' });
  });
  await page.getByRole('button', { name: 'Retry payment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'PayU fixture checkout', exact: true })).toBeVisible();
  expect(retriedOrder).toBe(orderId);
  expect(postedId).toBe('b'.repeat(24));
});
