import 'server-only';
import { randomBytes } from 'node:crypto';
import { db } from '@/db';
import { orders, payuAttempts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { DeliveryError } from './shipment-rules';
import { amountInPaise, PAYU_PRODUCT, paymentEmail, payuConfig, requestHash, validResponseHash, verifyPayuTransaction } from './payu';
import { finalizePayment } from './payment-finalization';
import { releaseStock } from './inventory';
import { scheduleOrderNotification } from './schedule-order-notification';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Order = typeof orders.$inferSelect;

// Caller holds the user and order locks. A pending attempt is ALWAYS reused.
export async function preparePayuCheckout(tx: Transaction, order: Order, email: unknown) {
  const config = payuConfig(true);
  if (order.razorpayOrderId) throw new DeliveryError('This historical Razorpay order requires support before retrying.', 409);
  if (['paid', 'refunded'].includes(order.paymentStatus) || order.orderStatus !== 'placed') throw new DeliveryError('Order is no longer payable', 409);
  let [attempt] = order.payuTxnId ? await tx.select().from(payuAttempts).where(eq(payuAttempts.txnId, order.payuTxnId)) : [];
  if (order.payuTxnId && !attempt) throw new DeliveryError('Payment needs manual reconciliation', 409);
  if (attempt && (attempt.environment !== config.environment || attempt.merchantKey !== config.key || attempt.amount !== order.total * 100 || attempt.orderId !== order.id))
    throw new DeliveryError('Payment configuration changed. Contact support for reconciliation.', 409);
  if (attempt?.status === 'paid') throw new DeliveryError('Order is already paid', 409);
  if (!attempt || attempt.status === 'failed' && attempt.verifiedAt) {
    const firstname = order.customerName || order.shippingAddress.name;
    if (!firstname || firstname.includes('|')) throw new DeliveryError('Invalid payment name');
    if (!Number.isSafeInteger(order.total * 100) || order.total <= 0) throw new DeliveryError('Invalid order total');
    [attempt] = await tx.insert(payuAttempts).values({ txnId: randomBytes(12).toString('hex'), orderId: order.id,
      environment: config.environment, merchantKey: config.key, amount: order.total * 100, firstname, email: paymentEmail(email || order.customerEmail) }).returning();
    await tx.update(orders).set({ payuTxnId: attempt.txnId, paymentMethod: 'payu', customerEmail: attempt.email, paymentStatus: 'pending', updatedAt: new Date() }).where(eq(orders.id, order.id));
  }
  const fields: Record<string, string> = { key: config.key, txnid: attempt.txnId, amount: (attempt.amount / 100).toFixed(2),
    productinfo: PAYU_PRODUCT, firstname: attempt.firstname, email: attempt.email, phone: order.customerPhone || order.shippingAddress.phone,
    udf1: order.id, udf2: '', udf3: '', udf4: '', udf5: '',
    surl: config.base + '/api/payment/payu/return', curl: config.base + '/api/payment/payu/return', furl: config.base + '/api/payment/payu/return' };
  fields.hash = requestHash(fields, config.salt);
  return { ok: true, orderId: order.id, action: config.action, fields };
}

export async function validatedPayuAttempt(txnid: string, callback?: Record<string, string>) {
  const config = payuConfig();
  const [attempt] = await db.select().from(payuAttempts).where(eq(payuAttempts.txnId, txnid));
  if (!attempt) throw new DeliveryError('Payment attempt not found', 404);
  if (attempt.environment !== config.environment || attempt.merchantKey !== config.key) throw new DeliveryError('Payment environment mismatch', 409);
  if (callback) {
    if (callback.key !== config.key || !validResponseHash(callback, config.salt)) throw new DeliveryError('Invalid PayU response hash');
    if (callback.udf1 !== attempt.orderId || callback.productinfo !== PAYU_PRODUCT || callback.firstname !== attempt.firstname || callback.email !== attempt.email ||
      amountInPaise(callback.amount) !== attempt.amount || [2, 3, 4, 5].some(i => callback['udf' + i]) ||
      callback.currency && callback.currency !== 'INR') throw new DeliveryError('PayU response does not match the payment attempt');
    for (const field of ['additionalCharges', 'additional_charges']) if (callback[field] && Number(callback[field]) !== 0) throw new DeliveryError('Unexpected PayU charges');
  }
  return attempt;
}

export async function reconcilePayu(txnid: string, callback?: Record<string, string>) {
  const attempt = await validatedPayuAttempt(txnid, callback);
  const detail = await verifyPayuTransaction(txnid);
  if (detail.txnid !== txnid || amountInPaise(String(detail.amt)) !== attempt.amount || detail.udf1 !== attempt.orderId ||
    detail.productinfo !== PAYU_PRODUCT || detail.currency && detail.currency !== 'INR') throw new DeliveryError('PayU verification does not match the order');
  if (callback?.mihpayid && detail.mihpayid !== callback.mihpayid) throw new DeliveryError('PayU payment reference mismatch');
  if (detail.additional_charges && Number(detail.additional_charges) !== 0) throw new DeliveryError('Unexpected PayU charges');
  if (detail.status === 'success' && detail.unmappedstatus === 'captured') {
    if (!/^\d{1,80}$/.test(detail.mihpayid || '')) throw new DeliveryError('Invalid PayU payment reference');
    const result = await finalizePayment({ provider: 'payu', orderId: txnid, paymentId: detail.mihpayid, amount: attempt.amount, currency: 'INR', method: 'payu' });
    if (!result.order.paymentData?.stockReviewRequired && result.order.orderStatus !== 'cancelled') scheduleOrderNotification(result.order.id);
    return result.order;
  }
  const failed = detail.status === 'failure' && ['failed', 'usercancelled', 'bounced', 'dropped'].includes((detail.unmappedstatus || '').toLowerCase());
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, attempt.orderId)).for('update');
    if (!order) throw new DeliveryError('Order not found', 404);
    const [current] = await tx.select().from(payuAttempts).where(eq(payuAttempts.txnId, txnid)).for('update');
    if (current.status !== 'paid') await tx.update(payuAttempts).set({ status: failed ? 'failed' : 'pending', verifiedAt: new Date() }).where(eq(payuAttempts.txnId, txnid));
    if (failed && current.status !== 'paid' && order.payuTxnId === txnid && !['paid', 'refunded'].includes(order.paymentStatus)) {
      const [updated] = await tx.update(orders).set({ paymentStatus: 'failed', updatedAt: new Date() }).where(eq(orders.id, order.id)).returning();
      await releaseStock(tx, order.id);
      return updated;
    }
    return order;
  });
}
