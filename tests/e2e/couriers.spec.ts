import { expect, test } from '@playwright/test';
const couriers = [
  { name: 'Shree Anjani', base: 'https://shreeanjani.co.in/tracking/' },
  { name: 'Shree Maruti', base: 'https://shreemaruti.com/track-shipment/' },
];
for (const [index, courier] of couriers.entries()) test(`${courier.name}: official tracking and copy on desktop and mobile`, async ({ browser }) => {
  const admin = await browser.newContext();
  await admin.request.post('/api/admin/login', { data: { username: 'e2eadmin', password: 'E2e-only-password-2026' } });
  const settings = await (await admin.request.get('/api/delivery/settings')).json();
  const provider = settings.providers.find((p: { name: string }) => p.name === courier.name);
  const orders = await (await admin.request.get('/api/orders?all=1')).json();
  const order = orders.orders.find((o: { orderNumber: string }) => o.orderNumber === `E2E-00${index + 3}`);
  const docket = `VPB-TEST-${index}`;
  expect((await admin.request.patch('/api/delivery/shipments/' + order.id, { data: { version: 0, providerId: provider.id, docketNumber: docket, status: 'ASSIGNED' } })).ok()).toBe(true);
  for (const mobile of [false, true]) {
    const customer = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await customer.request.post('/api/auth', { data: { action: 'login', phone: '9000000102', password: 'E2e-only-password-2026' } });
    const page = await customer.newPage();
    await page.goto('/track-order?num=' + order.orderNumber);
    await page.getByRole('button', { name: 'Track', exact: true }).click();
    const region = page.getByRole('region', { name: 'Shipment tracking' });
    await expect(region).toContainText(courier.name);
    await expect(region).toContainText(docket);
    await expect(region.getByRole('link', { name: 'Track Shipment' })).toHaveAttribute('href', courier.base + '?awb=' + docket);
    await region.getByRole('button', { name: 'Copy Tracking ID' }).click();
    await expect(region.getByRole('status')).toHaveText('Tracking ID copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(docket);
    // Exercise the legacy clipboard path used when Clipboard API is unavailable.
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }));
    await region.getByRole('button', { name: 'Copy Tracking ID' }).click();
    await expect(region.getByRole('status')).toHaveText('Tracking ID copied');
    await page.reload();
    await page.getByRole('button', { name: 'Track', exact: true }).click();
    await expect(region).toContainText(docket);
    await page.goto('/account');
    const card = page.getByRole('region', { name: 'Shipment tracking' }).filter({ hasText: docket });
    await expect(card).toContainText(courier.name);
    await expect(card.getByRole('link', { name: 'Track Shipment' })).toHaveAttribute('href', courier.base + '?awb=' + docket);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await customer.close();
  }
  await admin.close();
});
