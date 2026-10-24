import { db } from '@/db';
import { orders, orderItems, products, orderNotifications, deliveryAudit } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { DeliveryError } from './shipment-rules';
import { safelyEnsureInvoice } from './invoices';
import { lockedStock, releaseStock, validateStockItems } from './inventory';

type Confirmation = { orderId: string; paymentId: string; amount: number; currency: string; method?: string; userId?: string; webhook?: boolean; signature?: string; reconciledBy?: string };
// Callback, webhook and authorized stock reconciliation share the same order lock.
export async function finalizePayment(confirmation: Confirmation) {
  const result = await db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.razorpayOrderId, confirmation.orderId), confirmation.userId ? eq(orders.userId, confirmation.userId) : undefined)).for('update');
    if (!order) throw new DeliveryError('Order not found', 404);
    if (confirmation.currency !== 'INR' || !Number.isSafeInteger(confirmation.amount) || confirmation.amount <= 0 || confirmation.amount !== order.total * 100) throw new DeliveryError('Payment amount does not match the order', 400);
    if (['paid', 'refunded'].includes(order.paymentStatus) && order.razorpayPaymentId !== confirmation.paymentId) throw new DeliveryError('Payment needs manual reconciliation', 409);
    if (order.paymentStatus === 'refunded' || order.paymentStatus === 'paid' && (!order.paymentData?.stockReviewRequired || !confirmation.reconciledBy)) return { order, already: true };
    if (confirmation.reconciledBy && (order.paymentStatus !== 'paid' || order.orderStatus === 'cancelled')) throw new DeliveryError('This order cannot be released for fulfillment', 409);
    const snapshot = order.cartSnapshot;
    validateStockItems(snapshot);
    if (snapshot.some(item => !Number.isSafeInteger(item.price) || Number(item.price) < 0)) throw new DeliveryError('Order needs manual payment reconciliation', 409);
    const existing = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    let stockReviewRequired = order.orderStatus === 'cancelled';
    if (!existing.length || order.paymentData?.stockReviewRequired) {
      const stock = await lockedStock(tx, order.id, snapshot);
      stockReviewRequired ||= !snapshot.length || snapshot.some(item => {
        const product = stock.products.get(item.id);
        return !product || product.stockQuantity - (stock.otherReservations.get(item.id) || 0) < item.qty;
      });
      if (confirmation.reconciledBy && stockReviewRequired) throw new DeliveryError('Stock is still unavailable. Update inventory before confirming this order.', 409);
      // Allocate the whole cart or none of it. A late capture is preserved as paid
      // on hold; it cannot consume another checkout's active reservation.
      if (!stockReviewRequired) for (const item of snapshot) {
        const product = stock.products.get(item.id)!;
        const remaining = product.stockQuantity - item.qty;
        await tx.update(products).set({ stockQuantity: remaining, stockStatus: remaining ? 'in_stock' : 'out_of_stock', updatedAt: new Date() }).where(eq(products.id, item.id));
      }
      if (!existing.length) for (const item of snapshot) await tx.insert(orderItems).values({ orderId: order.id, productId: stock.products.get(item.id)?.id ?? null,
        productName: item.name || 'Cotton manjha', productImage: item.image || null, quantity: item.qty, price: item.price! });
    }
    await releaseStock(tx, order.id);
    const [paid] = await tx.update(orders).set({ paymentStatus: 'paid',
      orderStatus: order.orderStatus === 'cancelled' ? 'cancelled' : stockReviewRequired ? 'placed' : 'confirmed',
      razorpayPaymentId: confirmation.paymentId, razorpaySignature: confirmation.signature || order.razorpaySignature,
      razorpayWebhookVerified: confirmation.webhook || order.razorpayWebhookVerified, paidAt: order.paidAt || new Date(), paymentMethod: confirmation.method || order.paymentMethod,
      paymentData: sql`coalesce(${orders.paymentData}, '{}'::jsonb) || ${JSON.stringify({ capturedAmount: confirmation.amount / 100, stockReviewRequired, verifiedAt: new Date().toISOString() })}::jsonb`, updatedAt: new Date(),
    }).where(eq(orders.id, order.id)).returning();
    if (!stockReviewRequired && paid.orderStatus !== 'cancelled') await tx.insert(orderNotifications).values({ orderId: paid.id }).onConflictDoNothing();
    if (confirmation.reconciledBy) await tx.insert(deliveryAudit).values({ actorId: confirmation.reconciledBy, resource: 'order', resourceId: order.id, changes: { operation: 'stock_reconciled', outcome: 'success' } });
    return { order: paid, already: false };
  });
  if (!result.order.paymentData?.stockReviewRequired && result.order.paymentStatus === 'paid' && result.order.orderStatus !== 'cancelled') await safelyEnsureInvoice(result.order.id);
  return result;
}

export async function failPayment(gatewayOrderId: string, userId?: string) {
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.razorpayOrderId, gatewayOrderId), userId ? eq(orders.userId, userId) : undefined)).for('update');
    if (!order || ['paid', 'refunded'].includes(order.paymentStatus)) return;
    await tx.update(orders).set({ paymentStatus: 'failed', paymentData: { ...order.paymentData, lastError: 'Checkout did not complete' }, updatedAt: new Date() }).where(eq(orders.id, order.id));
    await releaseStock(tx, order.id);
  });
}
