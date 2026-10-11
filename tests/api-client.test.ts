import { afterEach, expect, test, vi } from 'vitest';
import { apiFetch, activityStore } from '../src/lib/api-client';
afterEach(() => { vi.unstubAllGlobals(); expect(activityStore.snapshot()).toHaveLength(0); });

test('each concurrent request keeps its own activity until its body completes', async () => {
  let first!: (value: Response) => void, second!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { first = resolve; })).mockImplementationOnce(() => new Promise<Response>(resolve => { second = resolve; })));
  const products = apiFetch('/api/products');
  const orders = apiFetch('/api/orders');
  expect(activityStore.snapshot()).toHaveLength(2);
  first(Response.json({ ok: true, products: [] }));
  await products;
  expect(activityStore.snapshot()).toHaveLength(1);
  expect(activityStore.snapshot()[0].path).toBe('/api/orders');
  second(Response.json({ ok: true, orders: [] }));
  await orders;
});
test('network and malformed responses become actionable failures and settle', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Offline')).mockResolvedValueOnce(new Response('<html>proxy failure</html>')));
  const network = await apiFetch('/api/products'); expect(network.status).toBe(503); expect((await network.json()).error).toContain('retry');
  expect((await apiFetch('/api/orders')).status).toBe(502);
});
test('deadline and cancellation always remove only their own request token', async () => {
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true }))));
  const controller = new AbortController();
  const cancelled = apiFetch('/api/products', { signal: controller.signal });
  controller.abort(); await expect(cancelled).rejects.toThrow();
  const timedOut = await apiFetch('/api/orders', undefined, 20);
  expect(timedOut.status).toBe(504); expect((await timedOut.json()).error).toContain('took too long');
});
