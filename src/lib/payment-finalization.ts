import { db } from '@/db';
import { orders, orderItems, products, orderNotifications } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { DeliveryError } from './shipment-rules';
import { isUuid } from './http-security';
import { safelyEnsureInvoice } from './invoices';

type Confirmation = { orderId: string; paymentId: string; amount: number; currency: string; method?: string; userId?: string; webhook?: boolean; signature?: string };
// Both the signed checkout response and the signed webhook use this locked transaction.
export async function finalizePayment(confirmation: Confirmation) {
  const result = await db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.razorpayOrderId, confirmation.orderId), confirmation.userId ? eq(orders.userId, confirmation.userId) : undefined)).for('update');
    if (!order) throw new DeliveryError('Order not found', 404);
    if (confirmation.currency !== 'INR' || confirmation.amount !== order.total * 100) throw new DeliveryError('Payment amount does not match the order', 400);
    if (order.paymentStatus === 'refunded') throw new DeliveryError('This payment has been refunded', 409);
    if (order.paymentStatus === 'paid') return { order, already: true };
    const snapshot = order.cartSnapshot as Array<{ id: string; qty: number; price: number; name: string; image?: string }>;
    if (snapshot.some(item => !isUuid(item.id) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99 || !Number.isSafeInteger(item.price) || item.price < 0)) throw new DeliveryError('Order needs manual payment reconciliation', 409);
    const existing = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    let stockReviewRequired = false;
    if (!existing.length) {
      // Stable lock order avoids deadlocks when two carts share products.
      for (const item of [...snapshot].sort((a, b) => a.id.localeCompare(b.id))) {
        const [product] = await tx.select().from(products).where(eq(products.id, item.id)).for('update');
        if (!product || product.stockQuantity < item.qty) stockReviewRequired = true;
        if (product) {
          const remaining = Math.max(0, product.stockQuantity - item.qty);
          await tx.update(products).set({ stockQuantity: remaining, stockStatus: remaining ? 'in_stock' : 'out_of_stock', updatedAt: new Date() }).where(eq(products.id, product.id));
        }
        await tx.insert(orderItems).values({ orderId: order.id, productId: product?.id ?? null, productName: item.name, productImage: item.image || null, quantity: item.qty, price: item.price });
      }
    }
    const [paid] = await tx.update(orders).set({ paymentStatus: 'paid', orderStatus: 'confirmed', razorpayPaymentId: confirmation.paymentId, razorpaySignature: confirmation.signature || order.razorpaySignature, razorpayWebhookVerified: confirmation.webhook || order.razorpayWebhookVerified, paidAt: order.paidAt || new Date(), paymentMethod: confirmation.method || order.paymentMethod, paymentData: sql`coalesce(${orders.paymentData}, '{}'::jsonb) || ${JSON.stringify({ capturedAmount: confirmation.amount / 100, stockReviewRequired, verifiedAt: new Date().toISOString() })}::jsonb`, updatedAt: new Date() }).where(eq(orders.id, order.id)).returning();
    // Atomic outbox: only a committed, verified payment can become eligible.
    // Provider I/O is deliberately outside this transaction.
    await tx.insert(orderNotifications).values({ orderId: paid.id }).onConflictDoNothing();
    return { order: paid, already: false };
  });
  await safelyEnsureInvoice(result.order.id);
  return result;
}
