import { test, expect, type Page, type BrowserContext } from '@playwright/test';

type Checkout = { orderId: string; action: string; fields: { amount: string; txnid: string }; needsVerification?: boolean };

async function captureCheckout(page: Page, path: string) {
  let resolve!: (checkout: Checkout) => void;
  let reject!: (error: unknown) => void;
  const received = new Promise<Checkout>((done, failed) => { resolve = done; reject = failed; });
  // Pass through the actual server response unchanged. Read it before delivery
  // because Chromium discards fetch response bodies during the hosted navigation.
  await page.route('**' + path, async route => {
    try {
      const response = await route.fetch();
      resolve(await response.json());
      await route.fulfill({ response });
    } catch (error) { reject(error); await route.abort(); }
  }, { times: 1 });
  return { received };
}

// Opt-in real PayU TEST traffic. Credentials stay in .env.payu-sandbox.local;
// the server uses a disposable database and disables customer notifications.
async function openSandboxCard(page: Page, context: BrowserContext, quantity: number): Promise<Checkout> {
  const readiness = await context.request.get('/api/payment/payu/status');
  expect(await readiness.json()).toMatchObject({ ok: true, environment: 'test' });
  await context.route(/^https:\/\/(?:secure|api|info)\.payu\.in\//, route => route.abort());
  const login = await context.request.post('/api/auth', { data: {
    action: 'login', phone: '9000000120', password: 'E2e-only-password-2026',
  } });
  expect(login.ok()).toBe(true);
  await page.addInitScript(qty => localStorage.setItem('vpb_cart', JSON.stringify([{
    id: '20000000-0000-4000-8000-000000000001', slug: 'loader-test-manjha', name: 'Sandbox fixture',
    price: 100, image: '/images/manjha/m01.png', qty, stock: 25,
  }])), quantity);
  await page.goto('/checkout');
  const initiation = await captureCheckout(page, '/api/payment/create');
  await page.getByRole('button', { name: 'Continue to Payment', exact: true }).click();
  let checkout: Checkout = await initiation.received;
  if (checkout.needsVerification) {
    const retried = await captureCheckout(page, '/api/payment/retry');
    await page.getByRole('button', { name: 'Retry payment', exact: true }).click();
    checkout = await retried.received;
  }
  expect(checkout.action).toBe('https://test.payu.in/_payment');
  expect(checkout.fields.amount).toBe((quantity * 100).toFixed(2));
  await expect(page).toHaveURL(/^https:\/\/apitest\.payu\.in\/public\//);
  await page.getByText('Cards (Credit/Debit)', { exact: true }).click();
  await page.getByPlaceholder('Enter Card Number', { exact: true }).fill('5123456789012346');
  await page.getByPlaceholder('MM/YY', { exact: true }).fill('05/30');
  await page.getByPlaceholder('Enter CVV', { exact: true }).fill('123');
  await page.getByPlaceholder('Enter name as on card', { exact: true }).fill('VPB Sandbox Test');
  await page.locator('#userConsentCheckbox').uncheck();
  await page.getByText('PROCEED', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue without saving', exact: true }).click();
  await expect(page).toHaveURL(/^https:\/\/acssimuat\.payubiz\.in\//);
  return checkout;
}

test('real sandbox card capture returns through verified callback to confirmed order', async ({ page, context }) => {
  const checkout = await openSandboxCard(page, context, 1);
  await page.locator('#password').fill('123456');
  await page.locator('#submitBtn').click();
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:3100\/checkout/, { timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'Order Confirmed!', exact: true })).toBeVisible({ timeout: 60000 });
  for (let i = 0; i < 2; i++) {
    const verification = await context.request.post('/api/payment/payu/verify', { data: { orderId: checkout.orderId } });
    expect(await verification.json()).toMatchObject({ ok: true, paymentStatus: 'paid', orderId: checkout.orderId });
  }
  const order = await (await context.request.get('/api/orders/' + checkout.orderId)).json();
  expect(order.order).toMatchObject({ total: 100, paymentStatus: 'paid', orderStatus: 'confirmed' });
  expect(await page.evaluate(() => sessionStorage.getItem('vpb-payu-order'))).toBeNull();
});

test('cancelled sandbox bank authentication is recovered through verification and a new attempt on the same order', async ({ page, context }) => {
  const checkout = await openSandboxCard(page, context, 2);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#cancelButton').click();
  // Bank cancellation returns to PayU's choices, rather than automatically
  // returning to the merchant. Recovery must therefore work without a callback.
  await expect(page).toHaveURL(/^https:\/\/apitest\.payu\.in\/public\//);
  await expect.poll(async () => {
    const response = await context.request.post('/api/payment/payu/verify', { data: { orderId: checkout.orderId } });
    return (await response.json()).paymentStatus;
  }, { timeout: 30000, intervals: [2000, 3000, 5000] }).toBe('failed');
  await page.goto('/checkout?paymentOrder=' + checkout.orderId);
  await expect(page.getByRole('button', { name: 'Retry payment', exact: true })).toBeVisible();
  const retried = await captureCheckout(page, '/api/payment/retry');
  await page.getByRole('button', { name: 'Retry payment', exact: true }).click();
  const next: Checkout = await retried.received;
  expect(next.orderId).toBe(checkout.orderId);
  expect(next.fields.amount).toBe('200.00');
  expect(next.fields.txnid).not.toBe(checkout.fields.txnid);
  await expect(page).toHaveURL(/^https:\/\/apitest\.payu\.in\/public\//);
});
