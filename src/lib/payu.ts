import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DeliveryError } from './shipment-rules';

export const PAYU_PRODUCT = 'VPB order';
export function payuConfig(forCheckout = false) {
  const environment = process.env.PAYU_ENV;
  const key = process.env.PAYU_MERCHANT_KEY?.trim();
  const salt = process.env.PAYU_MERCHANT_SALT?.trim();
  if (!key || !salt || !['test', 'production'].includes(environment || '') || process.env.PAYU_CURRENCY !== 'INR')
    throw new DeliveryError('PayU configuration is incomplete. Please contact support.', 503);
  if (forCheckout && process.env.PAYU_ENABLED !== 'true') throw new DeliveryError('Online checkout is temporarily unavailable.', 503);
  let base: URL;
  try { base = new URL(process.env.PAYU_BASE_URL || ''); }
  catch { throw new DeliveryError('PayU callback configuration is incomplete.', 503); }
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
    (base.protocol !== 'https:' && !(environment === 'test' && base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))))
    throw new DeliveryError('PayU callback configuration is invalid.', 503);
  return { environment: environment!, key, salt, base: base.origin,
    action: environment === 'test' ? 'https://test.payu.in/_payment' : 'https://secure.payu.in/_payment',
    verifyUrl: environment === 'test' ? 'https://test.payu.in/merchant/postservice?form=2' : 'https://info.payu.in/merchant/postservice.php?form=2' };
}
export const sha512 = (value: string) => createHash('sha512').update(value, 'utf8').digest('hex');
export function requestHash(p: Record<string, string>, salt: string) {
  return sha512([p.key, p.txnid, p.amount, p.productinfo, p.firstname, p.email,
    ...[1, 2, 3, 4, 5].map(i => p['udf' + i] || ''), '', '', '', '', '', salt].join('|'));
}
export function validResponseHash(p: Record<string, string>, salt: string) {
  if (!/^[a-f0-9]{128}$/i.test(p.hash || '') || p.splitInfo) return false;
  const charges = p.additionalCharges ?? p.additional_charges;
  const parts = [salt, p.status, '', '', '', '', '', ...[5, 4, 3, 2, 1].map(i => p['udf' + i] || ''),
    p.email, p.firstname, p.productinfo, p.amount, p.txnid, p.key];
  if (charges !== undefined) parts.unshift(charges);
  return timingSafeEqual(Buffer.from(sha512(parts.join('|')), 'hex'), Buffer.from(p.hash, 'hex'));
}
export function amountInPaise(value: unknown) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new DeliveryError('Invalid PayU amount');
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new DeliveryError('Invalid PayU amount');
  return amount;
}
export function paymentEmail(value: unknown) {
  if (typeof value !== 'string' || value.length > 180 || !/^[^\s@|]+@[^\s@|]+\.[^\s@|]+$/.test(value))
    throw new DeliveryError('Enter a valid email address for payment');
  return value.trim();
}
export async function verifyPayuTransaction(txnid: string) {
  const config = payuConfig();
  try {
    const response = await fetch(config.verifyUrl, { method: 'POST', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: config.key, command: 'verify_payment', var1: txnid,
        hash: sha512([config.key, 'verify_payment', txnid, config.salt].join('|')) }) });
    if (!response.ok) throw new Error();
    const body = await response.json();
    const detail = body.transaction_details?.[txnid];
    if (Number(body.status) !== 1 || !detail || detail.status === 'Not Found')
      throw new DeliveryError('Payment has not been confirmed by PayU yet. Check again shortly.', 409);
    return detail as Record<string, string>;
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError('PayU verification is temporarily unavailable. Your payment remains awaiting verification.', 503);
  }
}
