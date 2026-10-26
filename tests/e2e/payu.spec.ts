import { test, expect, type BrowserContext } from '@playwright/test';

const orderId = '10000000-0000-4000-8000-000000000001';
let customerCookies: Awaited<ReturnType<BrowserContext['cookies']>> = [];

test.beforeAll(async ({ request }) => {
  const login = await request.post('/api/auth', { data: { action: 'login', phone: '9000000120', password: 'E2e-only-password-2026' } });
  expect(login.ok()).toBe(true);
  customerCookies = (await request.storageState()).cookies;
});
test.beforeEach(async ({ page, context }) => {
  // Every provider request must be explicitly mocked by its test.
  await page.route(/^https:\/\/(?:secure|test|api|apitest)\.payu\.in\//, route => route.abort());
  await context.addCookies(customerCookies);
  await page.route('**/api/orders/' + orderId, route => route.fulfill({ json: { ok: true, order: { id: orderId, orderNumber: 'PAYU-BROWSER-FIXTURE', total: 100, subtotal: 100, discount: 0, shippingCharge: 0, paymentMethod: 'payu', paymentStatus: 'paid', orderStatus: 'confirmed' } } }));
  await page.addInitScript(() => {
    localStorage.setItem('vpb_cart', JSON.stringify([{ id: '20000000-0000-4000-8000-000000000001', slug: 'loader-test-manjha', name: 'Loader test manjha', price: 100, image: '/images/manjha/m01.png', qty: 1, stock: 25 }]));
  });
});

test('a restored sandbox checkout clears only its old receipt and opens a fresh Live checkout', async ({ page }) => {
  const oldRequest = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await page.addInitScript(({ orderId, oldRequest }) => {
    sessionStorage.setItem('vpb-payu-order', orderId);
    sessionStorage.setItem('vpb-checkout-request', JSON.stringify({ id: oldRequest, fingerprint: 'old-test-cart' }));
  }, { orderId, oldRequest });
  await page.route('**/api/payment/payu/verify', route => route.fulfill({ status: 409, json: {
    ok: false, code: 'PAYU_TEST_CHECKOUT_ENDED', orderId,
    error: 'Your previous checkout was a test payment. Live payments are now enabled. Continue to PayU to start a fresh checkout.',
  } }));
  let created = 0;
  await page.route('**/api/payment/create', async route => {
    created++;
    const body = route.request().postDataJSON();
    expect(body.idempotencyKey).not.toBe(oldRequest);
    expect(body.items).toEqual([{ id: '20000000-0000-4000-8000-000000000001', qty: 1 }]);
    expect(body.orderId).toBeUndefined();
    await route.fulfill({ json: { ok: true, orderId, action: 'https://secure.payu.in/_payment', fields: { txnid: '7'.repeat(24), amount: '100.00' } } });
  });
  await page.route('https://secure.payu.in/_payment', route => route.fulfill({ contentType: 'text/html', body: '<h1>Fresh Live checkout</h1>' }));
  await page.goto('/checkout?paymentOrder=' + orderId);
  await expect(page.getByText(/Your previous checkout was a test payment/)).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:3100/checkout');
  expect(await page.evaluate(() => sessionStorage.getItem('vpb-payu-order'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('vpb-checkout-request'))).toBeNull();
  await expect(page.getByRole('button', { name: 'Check payment status', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue to PayU', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fresh Live checkout', exact: true })).toBeVisible();
  expect(created).toBe(1);
});

test('an old sandbox idempotency response rotates the request without losing the cart', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/payment/create', async route => {
    requests.push(route.request().postDataJSON().idempotencyKey);
    await route.fulfill(requests.length === 1 ? { status: 409, json: { ok: false, code: 'PAYU_TEST_CHECKOUT_ENDED',
      error: 'Your previous checkout was a test payment. Continue to PayU to start a fresh checkout.' } }
      : { json: { ok: true, orderId, action: 'https://secure.payu.in/_payment', fields: { txnid: '8'.repeat(24), amount: '100.00' } } });
  });
  await page.route('https://secure.payu.in/_payment', route => route.fulfill({ contentType: 'text/html', body: '<h1>New Live attempt</h1>' }));
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Continue to Payment', exact: true }).click();
  await expect(page.getByText(/Your previous checkout was a test payment/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue to PayU', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New Live attempt', exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).not.toBe(requests[1]);
});

test('a Live environment mismatch never clears the saved attempt or offers another charge', async ({ page }) => {
  await page.addInitScript(orderId => sessionStorage.setItem('vpb-payu-order', orderId), orderId);
  await page.route('**/api/payment/payu/verify', route => route.fulfill({ status: 409, json: { ok: false, error: 'Payment environment mismatch' } }));
  await page.goto('/checkout?paymentOrder=' + orderId);
  await expect(page.getByText('Payment environment mismatch', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check payment status', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to PayU', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('vpb-payu-order'))).toBe(orderId);
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

test('Live hosted POST can follow the PayU checkout redirect under the actual CSP', async ({ page }) => {
  await page.route('**/api/payment/create', route => route.fulfill({ json: { ok: true, orderId,
    action: 'https://secure.payu.in/_payment', fields: { txnid: 'd'.repeat(24), amount: '100.00' } } }));
  await page.route('https://secure.payu.in/_payment', async route => {
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ status: 302, headers: { location: 'https://api.payu.in/public/checkout-fixture' }, body: '' });
  });
  await page.route('https://api.payu.in/public/checkout-fixture', route => route.fulfill({
    contentType: 'text/html', body: '<h1>Live hosted checkout fixture</h1>',
  }));
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Continue to Payment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Live hosted checkout fixture', exact: true })).toBeVisible();
});

test('sandbox hosted POST follows the observed redirect to apitest.payu.in', async ({ page }) => {
  await page.route('**/api/payment/create', route => route.fulfill({ json: { ok: true, orderId,
    action: 'https://test.payu.in/_payment', fields: { txnid: '9'.repeat(24), amount: '100.00' } } }));
  await page.route('https://test.payu.in/_payment', async route => {
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ status: 302, headers: { location: 'https://apitest.payu.in/public/checkout-fixture' }, body: '' });
  });
  await page.route('https://apitest.payu.in/public/checkout-fixture', route => route.fulfill({
    contentType: 'text/html', body: '<h1>Sandbox hosted checkout fixture</h1>',
  }));
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Continue to Payment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sandbox hosted checkout fixture', exact: true })).toBeVisible();
});

test('blocked form navigation explains recovery and repeated clicks never create a second payment', async ({ page }) => {
  let created = 0;
  await page.route('**/checkout', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "form-action 'self'" } });
  });
  await page.route('**/api/payment/create', async route => {
    created++;
    await route.fulfill({ json: { ok: true, orderId, action: 'https://secure.payu.in/_payment', fields: { txnid: 'e'.repeat(24) } } });
  });
  await page.route('**/api/payment/payu/verify', route => route.fulfill({ status: 503, json: { ok: false, error: 'PayU status temporarily unavailable' } }));
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Continue to Payment', exact: true }).click({ noWaitAfter: true });
  // Chromium's rejected form load can leave Playwright's navigation waiter
  // pending. Inspect/interact with the still-live document directly here.
  await expect.poll(() => page.evaluate(() => document.body.textContent)).toContain('The browser could not open PayU');
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Check payment status');
    button?.click(); button?.click();
  });
  await expect.poll(() => page.evaluate(() => document.body.textContent)).toContain('PayU status temporarily unavailable');
  expect(created).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem('vpb-payu-order'))).toBe(orderId);
});

test('pending recovery polls with a bound and still allows a later manual check', async ({ page }) => {
  await page.clock.install();
  let checks = 0;
  await page.route('**/api/payment/payu/verify', route => {
    checks++;
    return route.fulfill({ json: { ok: true, orderId, paymentStatus: 'pending' } });
  });
  await page.goto('/checkout?paymentOrder=' + orderId);
  await expect(page.getByText(/PayU has not confirmed a final payment result yet/)).toBeVisible();
  for (let i = 1; i <= 5; i++) {
    await page.clock.fastForward(i * 5000);
    await expect.poll(() => checks).toBe(i + 1);
    await expect(page.getByRole('button', { name: 'Check payment status', exact: true })).toBeEnabled();
  }
  await page.clock.fastForward(120000);
  expect(checks).toBe(6);
  await page.getByRole('button', { name: 'Check payment status', exact: true }).click();
  await expect.poll(() => checks).toBe(7);
});

test('the previous CSP blocks the hosted redirect even though the initial POST reaches PayU', async ({ page }) => {
  let posted = false;
  let reachedCheckout = false;
  await page.route('**/checkout', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(),
      'content-security-policy': "form-action 'self' https://test.payu.in https://secure.payu.in" } });
  });
  await page.route('**/api/payment/create', route => route.fulfill({ json: { ok: true, orderId,
    action: 'https://secure.payu.in/_payment', fields: { txnid: 'f'.repeat(24) } } }));
  await page.route('https://secure.payu.in/_payment', async route => {
    posted = true;
    await route.fulfill({ status: 302, headers: { location: 'https://api.payu.in/public/checkout-fixture' }, body: '' });
  });
  await page.route('https://api.payu.in/public/checkout-fixture', route => {
    reachedCheckout = true;
    return route.fulfill({ contentType: 'text/html', body: '<h1>Should be blocked by the old policy</h1>' });
  });
  await page.goto('/checkout');
  await page.evaluate(() => {
    (window as Window & { blockedPayu?: string }).blockedPayu = '';
    document.addEventListener('securitypolicyviolation', event => {
      (window as Window & { blockedPayu?: string }).blockedPayu = event.blockedURI;
    });
  });
  await page.getByRole('button', { name: 'Continue to Payment', exact: true }).click({ noWaitAfter: true });
  // Chromium reports the original form URL as blockedURI for this redirect.
  await expect.poll(() => page.evaluate(() => (window as Window & { blockedPayu?: string }).blockedPayu)).toBe('https://secure.payu.in/_payment');
  expect(posted).toBe(true);
  expect(reachedCheckout).toBe(false);
});

test('initiation errors remain actionable without submitting to PayU', async ({ page }) => {
  await page.route('**/api/payment/create', route => route.fulfill({ status: 400,
    json: { ok: false, error: 'Delivery address incomplete' } }));
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Continue to Payment', exact: true }).click();
  await expect(page.getByText('Delivery address incomplete', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to PayU', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem('vpb-payu-order'))).toBeNull();
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
  await expect(page.getByText(/If a PayU page is open/)).toBeVisible();
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
