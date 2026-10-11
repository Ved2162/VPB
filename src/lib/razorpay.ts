import Razorpay from "razorpay";
import crypto from "crypto";

// Read at call time so Next.js build does not require these env vars to be present.
function getKeyId() { return process.env.RAZORPAY_KEY_ID || ""; }
function getKeySecret() { return process.env.RAZORPAY_KEY_SECRET || ""; }
function getWebhookSecret() { return process.env.RAZORPAY_WEBHOOK_SECRET || ""; }

export function getRazorpay() {
  const keyId = getKeyId();
  const keySecret = getKeySecret();
  if (!keyId || !keySecret) return null;
  const gateway = new Razorpay({ key_id: keyId, key_secret: keySecret });
  // Razorpay 2.9 uses this Axios instance for its fixed-host API resources.
  const api = gateway.api as unknown as { rq: { defaults: { timeout: number; maxRedirects: number } } };
  api.rq.defaults.timeout = 8000;
  api.rq.defaults.maxRedirects = 0;
  return gateway;
}

export async function fetchGatewayPayment(paymentId: string) {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new Error('Invalid payment ID');
  const gateway = getRazorpay();
  if (!gateway) throw new Error('Payment verification is temporarily unavailable');
  return gateway.payments.fetch(paymentId);
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const keySecret = getKeySecret();
  if (!keySecret) return false;
  try {
    const body = orderId + "|" + paymentId;
    const expected = crypto.createHmac("sha256", keySecret).update(body).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(signature, "hex");
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}

export function verifyWebhookSignature(rawBody: string | Buffer, signature: string) {
  const webhookSecret = getWebhookSecret();
  if (!webhookSecret) return false;
  try {
    const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(signature, "hex");
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}

// Keep these as named exports for backward compatibility
export const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

export function inPaise(rupees: number) { return Math.round(Number(rupees) * 100); }
export function inRupees(paise: number) { return Number(paise) / 100; }
