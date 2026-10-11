import { readJson, canonicalJson } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, products, users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getUserFromHeader, orderNumber } from "@/lib/auth";
import { getRazorpay, inPaise } from "@/lib/razorpay";
import type { CartLine } from "@/lib/store";
import { sameOrigin, DeliveryError, textField } from '@/lib/shipment-rules';
import { activeUser, rateLimit, deliveryFailure } from '@/lib/delivery-server';

// Server-side cart validation + Razorpay order creation.
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
    const rzp = getRazorpay();
    if (!rzp) throw new DeliveryError('Payment service is temporarily unavailable', 503);
    return await db.transaction(async tx => {
    const [account] = await tx.select({ active: users.active, role: users.role }).from(users).where(eq(users.id, me.id)).for('update');
    if (!account?.active || account.role === 'delivery') throw new DeliveryError('Account unavailable', 403);
    const prods = await tx.select().from(products).where(inArray(products.id, ids));
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
    const shipping = subtotal - discount >= 6000 ? 0 : 99;
    const total = subtotal - discount + shipping;

    // Check for an existing pending order for this cart (de-duplicate refreshes/retries)
    const existing = await tx.select().from(orders).where(and(eq(orders.userId, me.id), eq(orders.paymentStatus, 'pending')));
    const reusable = existing.find((o) => o.paymentStatus === "pending" && o.total === total && o.orderStatus === "placed" && canonicalJson(o.cartSnapshot) === canonicalJson(cartSnapshot) && canonicalJson(o.shippingAddress) === canonicalJson({ name: address.name, phone: address.phone, addressLine: address.addressLine, city: address.city, state: address.state, pincode: address.pincode, landmark: address.landmark || "" }));

    let order;
    if (reusable?.razorpayOrderId) {
      // Re-use the same Razorpay order (prevents duplicates on retry/refresh)
      order = { id: reusable.razorpayOrderId, amount: inPaise(total), currency: "INR", receipt: reusable.orderNumber };
    } else {
      const receipt = orderNumber();
      // Insert local order in PLACED / PENDING state BEFORE opening Razorpay checkout
      const ins = await tx.insert(orders).values({
        userId: me.id, orderNumber: receipt, subtotal, shippingCharge: shipping, discount, total,
        paymentStatus: "pending", orderStatus: "placed",
        trackingNumber: null, courier: null,
        shippingAddress: { name: address.name, phone: address.phone, addressLine: address.addressLine, city: address.city, state: address.state, pincode: address.pincode, landmark: address.landmark || "" },
        paymentMethod: "razorpay",
        customerName: address.name, customerEmail: null, customerPhone: me.phone,
        cartSnapshot,
        paymentData: {},
      }).returning();

      try {
        const rzOrder = await rzp.orders.create({
          amount: inPaise(total),
          currency: "INR",
          receipt: receipt.slice(0, 40),
          notes: { orderDbId: ins[0].id, customerName: address.name },
        });
        await tx.update(orders).set({ razorpayOrderId: rzOrder.id }).where(eq(orders.id, ins[0].id));
        order = rzOrder;
      } catch {
        throw new DeliveryError('Payment gateway is temporarily unavailable. Please retry.', 502);
      }
    }

    return NextResponse.json({
      ok: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      order,
      amount: total,
      currency: "INR",
      prefill: { name: address.name, email: "", contact: me.phone },
    });
    });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}
