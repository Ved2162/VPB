import { expect, test } from '@playwright/test';
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { release, promise }; }
test('OTP motion follows sending, failed verification and genuine server success; unsafe return URLs stay local', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sending = gate();
  // External SMS delivery is mocked; verification still uses the real route and isolated DB hash.
  await page.route('**/api/otp/send', async route => { await sending.promise; await route.fulfill({ json: { ok: true, masked: '90****0102' } }); });
  await page.goto('/login?back=//evil.example');
  await expect(page.locator('.vpb-otp-motion')).toHaveAttribute('data-state', 'waiting');
  await page.getByPlaceholder('Your name').fill('E2E Customer');
  await page.getByPlaceholder('9876543210').fill('9000000102');
  await page.getByRole('button', { name: 'Send OTP', exact: true }).click();
  await expect(page.locator('.vpb-otp-motion')).toHaveAttribute('data-state', 'sending');
  await page.screenshot({ path: 'test-results/otp-sending-mobile.png', fullPage: true });
  sending.release();
  await page.getByLabel('6-digit OTP').filter({ visible: true }).fill('000000');
  await page.getByRole('button', { name: 'Verify OTP', exact: true }).click();
  await expect(page.locator('.vpb-otp-motion')).toHaveAttribute('data-state', 'error');
  await expect(page.getByText(/Incorrect OTP/).first()).toBeVisible();
  await expect(page.locator('.vpb-otp-verified')).toHaveCount(0);
  const verifying = gate();
  await page.route('**/api/otp/verify', async route => { await verifying.promise; await route.continue(); });
  await page.getByLabel('6-digit OTP').filter({ visible: true }).fill('654321');
  await page.getByRole('button', { name: 'Verify OTP', exact: true }).click();
  await expect(page.locator('.vpb-otp-motion')).toHaveAttribute('data-state', 'verifying');
  await expect(page.locator('.vpb-otp-filled')).toHaveCount(6);
  await page.screenshot({ path: 'test-results/otp-verifying-mobile.png', fullPage: true });
  verifying.release();
  await expect(page).toHaveURL(/\/account$/);
  const session = await (await page.request.get('/api/auth')).json();
  expect(session.user.role).toBe('customer');
});
test('protected routes reject forged sessions; API mutations reject cross-origin and oversized bodies', async ({ page, context }) => {
  await context.addCookies([{ name: 'vpb_token', value: 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYWRtaW4ifQ.', domain: '127.0.0.1', path: '/' }]);
  await page.goto('/admin'); await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await context.request.post('/api/auth', { headers: { origin: 'https://evil.example' }, data: { action: 'forgot' } })).status()).toBe(403);
  expect((await context.request.post('/api/auth', { data: { action: 'forgot', padding: 'x'.repeat(65537) } })).status()).toBe(413);
  const response = await context.request.get('/api/health');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
});
test('pending payment confirmation verifies the same order without creating another checkout', async ({ page, context }) => {
  await context.request.post('/api/auth', { data: { action: 'login', phone: '9000000102', password: 'E2e-only-password-2026' } });
  await page.addInitScript(() => {
    localStorage.setItem('vpb_cart', JSON.stringify([{ id: '20000000-0000-4000-8000-000000000001', slug: 'loader-test-manjha', name: 'Loader test manjha', price: 100, image: '/images/manjha/m01.png', qty: 1, stock: 25 }]));
    sessionStorage.setItem('vpb-payu-order', '10000000-0000-4000-8000-000000000001');
  });
  let created = 0, verified = 0;
  await page.route('**/api/payment/create', route => { created++; return route.abort(); });
  await page.route('**/api/payment/payu/verify', route => {
    verified++;
    expect(route.request().postDataJSON().orderId).toBe('10000000-0000-4000-8000-000000000001');
    return route.fulfill(verified === 1 ? { status: 409, json: { ok: false, error: 'Payment capture is pending' } } : { json: { ok: true, orderId: '10000000-0000-4000-8000-000000000001', paymentStatus: 'paid' } });
  });
  await page.goto('/checkout');
  await expect(page.getByText('Payment capture is pending', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Check payment status', exact: true }).click();
  await expect(page.getByText('Order Confirmed!', { exact: true })).toBeVisible();
  expect(created).toBe(0); expect(verified).toBe(2);
});
