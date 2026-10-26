import { createHash } from 'node:crypto';
import { eq, or } from 'drizzle-orm';
import { orders, payuAttempts } from '../src/db/schema';
import { finalizePayment as finalizeVerifiedPayment } from '../src/lib/payment-finalization';
import type { createTestDatabase } from './database';

// Generic invoice/stock/outbox tests originally used legacy IDs. Convert only
// their disposable fixtures into PayU attempts before exercising the real finalizer.
export async function finalizeFixturePayment(db: Awaited<ReturnType<typeof createTestDatabase>>['db'], confirmation: Parameters<typeof finalizeVerifiedPayment>[0]) {
  if (confirmation.provider === 'payu') return finalizeVerifiedPayment(confirmation);
  const txnId = createHash('sha256').update(confirmation.orderId).digest('hex').slice(0, 24);
  const [order] = await db.select().from(orders).where(or(eq(orders.razorpayOrderId, confirmation.orderId), eq(orders.payuTxnId, txnId)));
  if (!order) throw new Error('Missing disposable payment fixture');
  await db.insert(payuAttempts).values({ txnId, orderId: order.id, environment: 'test', merchantKey: 'isolated-fixture-key',
    amount: order.total * 100, firstname: order.customerName || 'Fixture', email: 'fixture@example.com' }).onConflictDoNothing();
  await db.update(orders).set({ razorpayOrderId: null, razorpayPaymentId: null, payuTxnId: txnId, paymentMethod: 'payu' }).where(eq(orders.id, order.id));
  return finalizeVerifiedPayment({ ...confirmation, provider: 'payu', orderId: txnId });
}
