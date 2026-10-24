import { publicProduct } from './catalog';
import { db } from '@/db';
import { inventoryReservations, products, orders } from '@/db/schema';
import { and, asc, eq, gt, lte, inArray, ne, sql, getTableColumns } from 'drizzle-orm';
import { isUuid } from './http-security';
import { DeliveryError } from './shipment-rules';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type StockItem = { id: string; qty: number; price?: number; name?: string; image?: string };
export function validateStockItems(value: unknown): asserts value is StockItem[] {
  if (!Array.isArray(value) || value.length > 100 || value.some(item => !item || !isUuid(item.id) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99) || new Set(value.map(item => item.id)).size !== value.length)
    throw new DeliveryError('Order needs manual payment reconciliation', 409);
}
export async function lockedStock(tx: Transaction, orderId: string, items: StockItem[]) {
  const ids = items.map(item => item.id);
  const rows = ids.length ? await tx.select({ ...getTableColumns(products), eligible: publicProduct }).from(products).where(inArray(products.id, ids)).orderBy(asc(products.id)).for('update') : [];
  if (ids.length) await tx.delete(inventoryReservations).where(and(inArray(inventoryReservations.productId, ids), lte(inventoryReservations.expiresAt, sql`now()`)));
  const reserved = ids.length ? await tx.select({ productId: inventoryReservations.productId, quantity: sql<number>`sum(${inventoryReservations.quantity})::int` })
    .from(inventoryReservations).where(and(inArray(inventoryReservations.productId, ids), ne(inventoryReservations.orderId, orderId), gt(inventoryReservations.expiresAt, sql`now()`))).groupBy(inventoryReservations.productId) : [];
  return { products: new Map(rows.map(p => [p.id, p])), otherReservations: new Map(reserved.map(r => [r.productId, Number(r.quantity)])) };
}
export async function reserveStock(tx: Transaction, orderId: string, value: unknown, checkPrices = false) {
  validateStockItems(value);
  if (!value.length) throw new DeliveryError('This order needs manual payment reconciliation', 409);
  const [owner] = await tx.select({ userId: orders.userId }).from(orders).where(eq(orders.id, orderId));
  if (owner?.userId) {
    const [pending] = await tx.select({ count: sql<number>`count(distinct ${inventoryReservations.orderId})::int` }).from(inventoryReservations)
      .innerJoin(orders, eq(orders.id, inventoryReservations.orderId))
      .where(and(eq(orders.userId, owner.userId), ne(orders.id, orderId), gt(inventoryReservations.expiresAt, sql`now()`)));
    if (Number(pending.count) >= 3) throw new DeliveryError('Finish an existing checkout or try again in 30 minutes.', 429);
  }
  const stock = await lockedStock(tx, orderId, value);
  for (const item of value) {
    const product = stock.products.get(item.id);
    if (!product?.eligible || product.stockStatus === 'out_of_stock' || product.stockQuantity - (stock.otherReservations.get(item.id) || 0) < item.qty)
      throw new DeliveryError('Stock is no longer available for this cart. Please refresh and try again.', 409);
    if (checkPrices && product.price !== item.price) throw new DeliveryError('A product price changed. Please refresh your cart.', 409);
  }
  // Repeated checkout requests renew their own reservation without competing with it.
  for (const item of value) await tx.insert(inventoryReservations).values({ orderId, productId: item.id, quantity: item.qty, expiresAt: sql`now() + interval '30 minutes'` })
    .onConflictDoUpdate({ target: [inventoryReservations.orderId, inventoryReservations.productId], set: { quantity: item.qty, expiresAt: sql`now() + interval '30 minutes'` } });
}
export async function releaseStock(tx: Transaction, orderId: string) {
  await tx.delete(inventoryReservations).where(eq(inventoryReservations.orderId, orderId));
}
