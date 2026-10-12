import 'server-only';
import type { orders } from '@/db/schema';

export const MSG91_ENDPOINT = 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/';
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

export function templatePayload(config: NonNullable<ReturnType<typeof msg91Config>>, order: typeof orders.$inferSelect, phone: string) {
  if (order.paymentStatus !== 'paid' || !order.paidAt || !order.razorpayPaymentId) throw new Error('unverified_order');
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
    const response = await fetch(MSG91_ENDPOINT, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', authkey: config.key }, body: JSON.stringify(payload) });
    // Explicit client rejection is safe to retry after correcting configuration.
    if (response.status === 429) return { status: 'retry', code: 'rate_limited' };
    if ([400, 401, 403, 404, 422].includes(response.status)) return { status: 'failed', code: 'http_' + response.status };
    if (!response.ok) return { status: 'unknown', code: 'http_' + response.status };
    const body = await response.json();
    if (body?.status === 'success' && typeof body.request_id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(body.request_id)) {
      return { status: 'accepted', code: null, requestId: body.request_id };
    }
    // Never infer delivery, or retry an unrecognised response that may represent acceptance.
    return { status: 'unknown', code: 'unrecognized_response' };
  } catch { return { status: 'unknown', code: 'transport_or_response_error' }; }
}
