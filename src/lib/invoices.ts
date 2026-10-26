import 'server-only';
import { db } from '@/db';
import { orders, orderItems, orderInvoices, invoiceCounters } from '@/db/schema';
import { eq, asc, sql } from 'drizzle-orm';
import { DeliveryError } from './shipment-rules';
import type { InvoiceSnapshot } from './invoice-types';

export function financialYear(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric' }).formatToParts(date);
  const year = Number(parts.find(p => p.type === 'year')!.value);
  const start = Number(parts.find(p => p.type === 'month')!.value) >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}
export async function ensureInvoice(orderId: string) {
  return db.transaction(async tx => {
    // The order lock serializes same-order issuance; the counter row serializes numbering.
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new DeliveryError('Order not found', 404);
    const [existing] = await tx.select().from(orderInvoices).where(eq(orderInvoices.orderId, orderId));
    if (existing) return existing;
    if (order.paymentStatus !== 'paid' || !order.paidAt || !(order.razorpayPaymentId || order.payuPaymentId) || ['cancelled', 'placed', 'rejected'].includes(order.orderStatus))
      throw new DeliveryError('Invoice is available after verified payment and order confirmation', 409);
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id));
    const values = [order.subtotal, order.shippingCharge, order.discount, order.total, ...items.flatMap(i => [i.price, i.quantity])];
    if (!items.length || values.some(v => !Number.isSafeInteger(v) || v < 0) || items.some(i => i.quantity < 1) ||
      items.reduce((sum, i) => sum + i.price * i.quantity, 0) !== order.subtotal ||
      order.subtotal + order.shippingCharge - order.discount !== order.total || order.discount > order.subtotal)
      throw new DeliveryError('Invoice totals need review. Please contact support.', 409);
    const issuedAt = new Date();
    const fy = financialYear(issuedAt);
    const [counter] = await tx.insert(invoiceCounters).values({ financialYear: fy, lastNumber: 1 }).onConflictDoUpdate({
      target: invoiceCounters.financialYear, set: { lastNumber: sql`${invoiceCounters.lastNumber} + 1` },
    }).returning();
    const snapshot: InvoiceSnapshot = {
      version: 1, orderNumber: order.orderNumber, paidAt: order.paidAt.toISOString(), paymentMethod: order.paymentMethod,
      seller: { name: process.env.INVOICE_SELLER_NAME?.trim() || 'Verai Patang Bhandar', address: process.env.INVOICE_SELLER_ADDRESS?.trim() || '',
        phone: process.env.INVOICE_SUPPORT_PHONE?.trim() || '', email: process.env.INVOICE_SUPPORT_EMAIL?.trim() || '' },
      customer: { name: order.customerName || order.shippingAddress.name || 'Customer', phone: order.customerPhone || '', email: order.customerEmail || '' },
      address: order.shippingAddress, billingSameAsDelivery: true,
      items: items.map(i => ({ name: i.productName, quantity: i.quantity, unitPrice: i.price, total: i.quantity * i.price })),
      subtotal: order.subtotal, shipping: order.shippingCharge, discount: order.discount, total: order.total,
      kind: 'order_receipt', taxNote: 'Order receipt, not a GST tax invoice. Tax breakdown is not recorded by this checkout.',
    };
    const [invoice] = await tx.insert(orderInvoices).values({ orderId, invoiceNumber: `VPB/${fy}/${String(counter.lastNumber).padStart(6, '0')}`, issuedAt, snapshot }).returning();
    return invoice;
  });
}
export async function safelyEnsureInvoice(orderId: string) {
  try { await ensureInvoice(orderId); }
  catch { console.error('[invoice]', { code: 'issuance_failed', orderId }); }
  // Payment is already committed. Authenticated invoice access can safely retry issuance.
}
