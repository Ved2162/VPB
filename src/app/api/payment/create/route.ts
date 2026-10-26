import { reserveStock } from '@/lib/inventory';
import { publicProduct } from '@/lib/catalog';
import { readJson, canonicalJson, isUuid } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, products, users } from "@/db/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { orderNumber } from "@/lib/auth";
import { payuConfig, paymentEmail } from '@/lib/payu';
import { preparePayuCheckout } from '@/lib/payu-payments';
import { sameOrigin, DeliveryError, textField } from '@/lib/shipment-rules';
import { activeUser, rateLimit, deliveryFailure } from '@/lib/delivery-server';

// Server-side cart validation + PayU checkout preparation.
// Trusts ONLY the cart lines and re-prices from the database — never the frontend total.
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const me = await activeUser(req);
    await rateLimit("checkout:" + me.id, 20, 60);
    if (me.role === 'delivery') return NextResponse.json({ ok: false, error: 'Delivery staff cannot manage payments' }, { status: 403 });
    if (!me) return NextResponse.json({ ok: false, error: "Login required", needLogin: true }, { status: 401 });

    const body = await readJson(req);
    const { items, address } = body as { items: { id: string; qty: number }[]; address: any };
    if (!Array.isArray(items) || !items.length || items.length > 100) return NextResponse.json({ ok: false, error: "Cart is empty" }, { status: 400 });
    if (!address?.addressLine || !address?.city || !address?.pincode || !address?.phone || !address?.name) {
      return NextResponse.json({ ok: false, error: "Delivery address incomplete" }, { status: 400 });
    }

    for (const item of items) if (!item || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99) throw new DeliveryError('Quantity must be a whole number between 1 and 99');
    for (const [key, limit] of Object.entries({ name: 120, phone: 20, addressLine: 220, city: 100, state: 100, pincode: 10 })) address[key] = textField(address[key], key, limit, true);
    if (!/^\d{6}$/.test(address.pincode) || !/^\+?[0-9]{7,15}$/.test(address.phone)) throw new DeliveryError('Invalid address phone or pincode');
    address.landmark = textField(address.landmark ?? '', 'landmark', 200);
    const ids = items.map((i) => i.id).filter(Boolean);
    if (ids.length !== items.length || ids.some((i: string) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(i))) {
      return NextResponse.json({ ok: false, error: "Invalid cart contents — please reload and try again" }, { status: 400 });
    }
    if (new Set(ids).size !== ids.length) throw new DeliveryError('Duplicate cart items');
    payuConfig(true);
    if (!isUuid(body.idempotencyKey)) throw new DeliveryError('Invalid checkout request ID');
    return await db.transaction(async tx => {
    const [account] = await tx.select({ active: users.active, email: users.email, role: users.role, sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, me.id)).for('update');
    if (account && account.sessionVersion !== me.sessionVersion) throw new DeliveryError('Session expired. Please log in again', 401);
    if (!account?.active || account.role === 'delivery') throw new DeliveryError('Account unavailable', 403);
    const [previousRequest] = await tx.select().from(orders).where(or(eq(orders.checkoutKey, body.idempotencyKey), and(eq(orders.userId, me.id), sql`coalesce(${orders.paymentData}->'checkoutRequestIds', '[]'::jsonb) @> ${JSON.stringify([body.idempotencyKey])}::jsonb`)));
    if (previousRequest) {
      if (previousRequest.userId !== me.id) throw new DeliveryError('Checkout request is unavailable', 409);
      if (['paid', 'refunded'].includes(previousRequest.paymentStatus)) return NextResponse.json({ ok: true, alreadyPaid: true, orderId: previousRequest.id });
    }
    const email = paymentEmail(body.email || account.email);
    const prods = await tx.select().from(products).where(and(inArray(products.id, ids), publicProduct));
    const map = new Map(prods.map((p) => [p.id, p]));

    let subtotal = 0;
    const cartSnapshot: { id: string; qty: number; price: number; name: string; image: string }[] = [];
    for (const it of items) {
      const p = map.get(it.id);
      if (!p || !p.active) return NextResponse.json({ ok: false, error: `Product unavailable: reload cart and try again` }, { status: 400 });
      if (p.stockStatus === "out_of_stock" || p.stockQuantity < it.qty) {
        return NextResponse.json({ ok: false, error: `${p.name} is out of stock (only ${p.stockQuantity} left)` }, { status: 400 });
      }
      subtotal += p.price * it.qty;
      cartSnapshot.push({ id: p.id, qty: it.qty, price: p.price, name: p.name, image: p.images?.[0] || "" });
    }

    const discount = subtotal >= 6000 ? 200 : 0;
    const shipping = 0;
    const total = subtotal - discount + shipping;

    // Check for an existing pending order for this cart (de-duplicate refreshes/retries)
    const existing = await tx.select().from(orders).where(and(eq(orders.userId, me.id), inArray(orders.paymentStatus, ['pending', 'failed'])));
    const reusable = existing.find((o) => !!o.payuTxnId && o.total === total && o.orderStatus === "placed" && canonicalJson(o.cartSnapshot) === canonicalJson(cartSnapshot) && canonicalJson(o.shippingAddress) === canonicalJson({ name: address.name, phone: address.phone, addressLine: address.addressLine, city: address.city, state: address.state, pincode: address.pincode, landmark: address.landmark || "" }));

    const legacy = existing.find(o => o.razorpayOrderId && o.total === total && canonicalJson(o.cartSnapshot) === canonicalJson(cartSnapshot));
    if (legacy) throw new DeliveryError('An existing Razorpay checkout needs reconciliation. Contact support.', 409);
    if (previousRequest && previousRequest.id !== reusable?.id) throw new DeliveryError('The cart or address changed. Start a new checkout request.', 409);
    let order;
    if (reusable?.payuTxnId) {
      const [current] = await tx.select().from(orders).where(and(eq(orders.id, reusable.id), inArray(orders.paymentStatus, ['pending', 'failed']), eq(orders.orderStatus, 'placed'))).for('update');
      if (!current) throw new DeliveryError('This checkout has already changed. Please refresh.', 409);
      const requestIds: string[] = current.paymentData?.checkoutRequestIds || [];
      if (current.checkoutKey !== body.idempotencyKey && !requestIds.includes(body.idempotencyKey)) {
        if (requestIds.length >= 100) throw new DeliveryError('Too many checkout requests. Please use My Orders.', 429);
        await tx.update(orders).set({ paymentData: { ...current.paymentData, checkoutRequestIds: [...requestIds, body.idempotencyKey] } }).where(eq(orders.id, current.id));
      }
      if (current.paymentStatus === 'failed') return NextResponse.json({ ok: true, needsVerification: true, orderId: current.id });
      await reserveStock(tx, reusable.id, cartSnapshot, true);
      order = current;
    } else {
      const receipt = orderNumber();
      // Insert local order in PLACED / PENDING state BEFORE opening PayU checkout
      const ins = await tx.insert(orders).values({
        userId: me.id, checkoutKey: body.idempotencyKey, orderNumber: receipt, subtotal, shippingCharge: shipping, discount, total,
        paymentStatus: "pending", orderStatus: "placed",
        trackingNumber: null, courier: null,
        shippingAddress: { name: address.name, phone: address.phone, addressLine: address.addressLine, city: address.city, state: address.state, pincode: address.pincode, landmark: address.landmark || "" },
        paymentMethod: "payu",
        customerName: address.name, customerEmail: email, customerPhone: me.phone,
        cartSnapshot,
        paymentData: {},
      }).returning();

      await reserveStock(tx, ins[0].id, cartSnapshot, true);
      order = ins[0];
    }
    return NextResponse.json(await preparePayuCheckout(tx, order, email));
    });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}
