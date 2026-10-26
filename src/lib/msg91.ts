import 'server-only';
import type { orders } from '@/db/schema';
import { providerBody, sanitizeMsg91 } from './msg91-diagnostics';

export const MSG91_ENDPOINT = 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/';
export const MSG91_TEMPLATES_ENDPOINT = 'https://control.msg91.com/api/v5/whatsapp/get-template-client/';
export const MSG91_LOGS_ENDPOINT = 'https://control.msg91.com/api/v5/report/logs/wa';
const fields = ['customer_name', 'order_id', 'order_date', 'total_amount', 'confirmation_message', 'payment_status'] as const;
type Field = typeof fields[number];
export function indianWhatsAppNumber(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\+?[\d\s().-]+$/.test(value.trim())) return null;
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  return /^[6-9]\d{9}$/.test(digits) ? '91' + digits : null;
}

export function msg91Config() {
  if (process.env.MSG91_WHATSAPP_ENABLED !== 'true') return null;
  const key = process.env.MSG91_AUTH_KEY?.trim();
  const number = process.env.MSG91_WHATSAPP_NUMBER?.trim();
  const name = process.env.MSG91_TEMPLATE_NAME?.trim();
  const language = process.env.MSG91_TEMPLATE_LANGUAGE?.trim();
  const namespaceSetting = process.env.MSG91_TEMPLATE_NAMESPACE?.trim();
  // Some MSG91-generated requests explicitly use JSON null.
  // Require an explicit setting so missing configuration is not silently inferred.
  const namespace = namespaceSetting === 'null' ? null : namespaceSetting;
  const amountFormat = process.env.MSG91_TEMPLATE_AMOUNT_FORMAT?.trim() || 'currency';
  const variables = process.env.MSG91_TEMPLATE_BODY_VARIABLES?.split(',').map(v => v.trim()) as Field[] | undefined;
  if (!key || !number || !/^\d{8,15}$/.test(number) || !name || !/^[a-z0-9_]+$/.test(name) ||
      !language || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language) || !namespaceSetting ||
      !variables?.length || variables.some(v => !fields.includes(v)) ||
      !['currency', 'number'].includes(amountFormat)) return null;
  return { key, number, name, language, namespace, variables, amountFormat };
}

export async function inspectMsg91Template(config: NonNullable<ReturnType<typeof msg91Config>>) {
  try {
    const url = new URL(MSG91_TEMPLATES_ENDPOINT + config.number);
    url.searchParams.set('template_name', config.name);
    const response = await fetch(url, { headers: { accept: 'application/json', authkey: config.key }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    const raw = await providerBody(response);
    const body = raw as { status?: string; hasError?: boolean; data?: Array<{ name: string; namespace: string | null; languages: Array<{ language: string; status: string; is_disabled: boolean | number; variables: string[]; variable_type: Record<string, { type: string }>; parameter_format?: string }> }> };
    if (!response.ok || body.status !== 'success' || body.hasError || !Array.isArray(body.data)) {
      console.error('[whatsapp:template-api]', JSON.stringify({ httpStatus: response.status, response: sanitizeMsg91(raw, [config.key, config.number]) }));
      return { ready: false, code: 'template_lookup_failed' };
    }
    const template = body.data.find(item => item.name === config.name);
    const language = template?.languages?.find(item => item.language === config.language);
    let code: string | null = null;
    if (!template) code = 'template_not_found';
    else if (!language) code = 'template_language_not_found';
    else if (language.status.toLowerCase() !== 'approved') code = ['pending', 'rejected', 'paused', 'disabled'].includes(language.status.toLowerCase()) ? 'template_' + language.status.toLowerCase() : 'template_not_approved';
    else if (language.is_disabled) code = 'template_disabled';
    else if (template.namespace !== config.namespace) code = 'template_namespace_mismatch';
    else {
      const expected = config.variables.map((_, index) => 'body_' + (index + 1));
      if (language.parameter_format && language.parameter_format !== 'POSITIONAL' ||
          !Array.isArray(language.variables) || [...language.variables].sort().join(',') !== expected.sort().join(',') ||
          expected.some(key => language.variable_type?.[key]?.type !== 'text')) code = 'template_variables_mismatch';
    }
    console.info('[whatsapp:template-check]', { templateName: config.name, language: config.language, approvalStatus: language?.status ?? null, namespaceMatches: template?.namespace === config.namespace, expectedVariables: config.variables.map((_, index) => 'body_' + (index + 1)), code });
    return { ready: code === null, code };
  } catch { console.error('[whatsapp:template-api]', { code: 'template_lookup_unavailable' }); return { ready: false, code: 'template_lookup_unavailable' }; }
}

export async function inspectMsg91Delivery(config: NonNullable<ReturnType<typeof msg91Config>>, requestId: string, customerRedactions: string[] = []) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(requestId)) return { available: false, code: 'invalid_provider_request_id' };
  try {
    const date = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
    const url = new URL(MSG91_LOGS_ENDPOINT);
    url.searchParams.set('startDate', date(new Date(Date.now() - 2 * 86400000)));
    url.searchParams.set('endDate', date(new Date()));
    url.searchParams.set('requestId', requestId);
    url.searchParams.set('fields', 'requestedAt,requestId,failureReason,status,sentTime,deliveryTime,templateName');
    const response = await fetch(url, { headers: { accept: 'application/json', authkey: config.key }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const raw = await providerBody(response);
    const redactions = [config.key, config.number, ...customerRedactions];
    console.info('[whatsapp:delivery-report]', JSON.stringify({ httpStatus: response.status, response: sanitizeMsg91(raw, redactions) }));
    const body = raw as { data?: Array<{ requestId: string; status: string; failureReason: string | null; templateName: string; sentTime: unknown; deliveryTime: unknown }> };
    if (!response.ok || !Array.isArray(body.data)) return { available: false, code: 'delivery_lookup_failed' };
    const reports = body.data.filter(item => item.requestId === requestId).map(item => ({ requestId: item.requestId, status: item.status, failureReason: sanitizeMsg91(item.failureReason, redactions), templateName: item.templateName, sentTime: item.sentTime, deliveryTime: item.deliveryTime }));
    return { available: true, reports };
  } catch { console.error('[whatsapp:delivery-report]', { code: 'delivery_lookup_unavailable' }); return { available: false, code: 'delivery_lookup_unavailable' }; }
}

export function templatePayload(config: NonNullable<ReturnType<typeof msg91Config>>, order: typeof orders.$inferSelect, phone: string) {
  if (order.paymentStatus !== 'paid' || !order.paidAt || !(order.razorpayPaymentId || order.payuPaymentId)) throw new Error('unverified_order');
  const values: Record<Field, string> = {
    customer_name: (order.customerName || 'Customer').replace(/[\r\n\t]/g, ' ').slice(0, 120),
    order_id: order.orderNumber,
    // Existing order timestamps are PostgreSQL timestamp without time zone, stored as UTC.
    order_date: new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(order.createdAt),
    total_amount: (config.amountFormat === 'number' ? '' : 'INR ') + order.total.toFixed(2),
    confirmation_message: 'Your order is confirmed. Thank you for shopping with Verai Patang Bhandar.',
    payment_status: 'Paid',
  };
  return {
    integrated_number: config.number, content_type: 'template', CRQID: 'vpb-order-' + order.id,
    payload: { messaging_product: 'whatsapp', type: 'template', template: {
      name: config.name, language: { code: config.language, policy: 'deterministic' }, namespace: config.namespace,
      to_and_components: [{ to: [phone], components: Object.fromEntries(config.variables.map((field, i) => ['body_' + (i + 1), { type: 'text', value: values[field] }])) }],
    } },
  };
}

export type SendResult = { status: 'accepted' | 'retry' | 'failed' | 'unknown'; code: string | null; requestId?: string };
export async function sendTemplate(config: NonNullable<ReturnType<typeof msg91Config>>, payload: ReturnType<typeof templatePayload>): Promise<SendResult> {
  try {
    const redactions = [config.key, config.number, ...payload.payload.template.to_and_components.flatMap(item => [...item.to, ...Object.values(item.components).map(component => component.value)])];
    console.info('[whatsapp:request]', JSON.stringify({ endpoint: MSG91_ENDPOINT, apiVersion: 'v5', templateName: config.name, language: config.language, namespace: config.namespace, variableOrder: config.variables, request: sanitizeMsg91(payload, redactions) }));
    const response = await fetch(MSG91_ENDPOINT, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', authkey: config.key }, body: JSON.stringify(payload) });
    const raw = await providerBody(response);
    console.info('[whatsapp:response]', JSON.stringify({ httpStatus: response.status, response: sanitizeMsg91(raw, redactions) }));
    // Explicit client rejection is safe to retry after correcting configuration.
    if (response.status === 429) return { status: 'retry', code: 'rate_limited' };
    if ([400, 401, 403, 404, 422].includes(response.status)) return { status: 'failed', code: 'http_' + response.status };
    if (!response.ok) return { status: 'unknown', code: 'http_' + response.status };
    const body = raw as { status?: string; request_id?: string; hasError?: boolean };
    if (body?.status === 'success' && !body.hasError && typeof body.request_id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(body.request_id)) {
      return { status: 'accepted', code: null, requestId: body.request_id };
    }
    // Never infer delivery, or retry an unrecognised response that may represent acceptance.
    return { status: 'unknown', code: 'unrecognized_response' };
  } catch { return { status: 'unknown', code: 'transport_or_response_error' }; }
}
