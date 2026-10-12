import { afterEach, test, expect, vi } from 'vitest';
import { inspectMsg91Template, inspectMsg91Delivery, MSG91_TEMPLATES_ENDPOINT, MSG91_LOGS_ENDPOINT, msg91Config } from '../src/lib/msg91';

const config = { key: 'test-only-credential', number: '919400000099', name: 'test_fixture', language: 'en', namespace: 'test-namespace', amountFormat: 'number', variables: ['customer_name', 'order_id'] } as NonNullable<ReturnType<typeof msg91Config>>;
function template(overrides: Record<string, unknown> = {}) {
  return { name: config.name, namespace: config.namespace, languages: [{ language: 'en', status: 'approved', is_disabled: 0, parameter_format: 'POSITIONAL', variables: ['body_1', 'body_2'], variable_type: { body_1: { type: 'text' }, body_2: { type: 'text' } }, ...overrides }] };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
test('official Get Templates contract validates the exact approved language, namespace and variables', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: 'success', hasError: false, data: [template()] }));
  vi.stubGlobal('fetch', fetcher);
  expect(await inspectMsg91Template(config)).toEqual({ ready: true, code: null });
  expect(fetcher.mock.calls[0][0].toString()).toBe(MSG91_TEMPLATES_ENDPOINT + config.number + '?template_name=' + config.name);
  expect(fetcher.mock.calls[0][1].headers.authkey).toBe(config.key);
});
test.each([
  [{ status: 'pending' }, 'template_pending'],
  [{ status: 'rejected' }, 'template_rejected'],
  [{ language: 'en_US' }, 'template_language_not_found'],
  [{ is_disabled: 1 }, 'template_disabled'],
  [{ variables: ['body_1', 'body_2', 'button_1'] }, 'template_variables_mismatch'],
  [{ variable_type: { body_1: { type: 'image' }, body_2: { type: 'text' } } }, 'template_variables_mismatch'],
])('approval and schema failures fail closed: %s', async (overrides, code) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'success', data: [template(overrides)] })));
  expect(await inspectMsg91Template(config)).toEqual({ ready: false, code });
});
test('missing template and mismatched namespace are diagnosed without guessing replacements', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ status: 'success', data: [] })).mockResolvedValueOnce(Response.json({ status: 'success', data: [{ ...template(), namespace: 'other-namespace' }] }));
  vi.stubGlobal('fetch', fetcher);
  expect(await inspectMsg91Template(config)).toEqual({ ready: false, code: 'template_not_found' });
  expect(await inspectMsg91Template(config)).toEqual({ ready: false, code: 'template_namespace_mismatch' });
});
test('Get Templates errors are fully structured and sanitized; credentials never enter logs', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'fail', hasError: true, errors: { code: '401', reason: 'Unauthorized', authkey: config.key, customerNumber: '919400000021' } }, { status: 401 })));
  expect(await inspectMsg91Template(config)).toEqual({ ready: false, code: 'template_lookup_failed' });
  const logs = JSON.stringify(log.mock.calls); expect(logs).toContain('Unauthorized'); expect(logs).toContain('401');
  expect(logs).not.toContain(config.key); expect(logs).not.toContain('919400000021');
});
test('read-only delivery lookup uses documented field filtering and preserves failure without leaking customer data', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data: [{ requestId: 'request_test', status: 'failed', failureReason: 'Template missing for Private Customer 919400000021', templateName: 'test_fixture', sentTime: null, deliveryTime: null }], metadata: { paginationToken: 'secret-pagination-token' } }));
  vi.stubGlobal('fetch', fetcher);
  const report = await inspectMsg91Delivery(config, 'request_test', ['Private Customer']);
  expect(report).toMatchObject({ available: true, reports: [{ status: 'failed', sentTime: null, deliveryTime: null }] });
  const url = fetcher.mock.calls[0][0] as URL;
  expect(url.origin + url.pathname).toBe(MSG91_LOGS_ENDPOINT); expect(url.searchParams.get('requestId')).toBe('request_test');
  expect(url.searchParams.get('fields')).not.toContain('customerNumber'); expect(url.searchParams.get('fields')).not.toContain('content');
  const logged = JSON.stringify(log.mock.calls); expect(logged).toContain('Template missing');
  expect(logged).not.toContain('Private Customer'); expect(logged).not.toContain('919400000021'); expect(logged).not.toContain('secret-pagination-token');
  expect(JSON.stringify(report)).not.toContain('Private Customer');
});
