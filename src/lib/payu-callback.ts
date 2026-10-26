import { readBody } from './http-security';
import { DeliveryError } from './shipment-rules';
import { reconcilePayu, validatedPayuAttempt } from './payu-payments';

export async function processPayuCallback(req: Request, allowPendingReturn = false) {
  if (!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw new DeliveryError('Unsupported PayU content type', 415);
  const params = new URLSearchParams(await readBody(req));
  const fields: Record<string, string> = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(fields, key)) throw new DeliveryError('Duplicate PayU field');
    fields[key] = value;
  }
  if (!/^[a-f0-9]{24}$/.test(fields.txnid || '')) throw new DeliveryError('Invalid PayU transaction ID');
  const attempt = await validatedPayuAttempt(fields.txnid, fields);
  try { return await reconcilePayu(fields.txnid, fields); }
  catch (error) {
    if (allowPendingReturn && error instanceof DeliveryError && [409, 503].includes(error.status)) return { id: attempt.orderId };
    throw error;
  }
}
