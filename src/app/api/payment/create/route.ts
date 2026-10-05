import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, products } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getUserFromHeader, orderNumber } from "@/lib/auth";
import { getRazorpay, inPaise } from "@/lib/razorpay";
import type { CartLine } from "@/lib/store";

// Server-side cart validation + Razorpay order creation.
// Trusts ONLY the cart lines and re-prices from the database — never the frontend total.
export async function POST(req: Request) {
  try {
    const me = getUserFromHeader(req);
    if (!me) return NextResponse.json({ ok: false, error: "Login required", needLogin: true }, { status: 401 });

    const body = await req.json();
    const { items, address }: { items: { id: string; qty: number }[]; address: any } = body;
    if (!items?.length) return NextResponse.json({ ok: false, error: "Cart is empty" }, { status: 400 });
    if (!address?.addressLine || !address?.city || !address?.pincode || !address?.phone || !address?.name) {
      return NextResponse.json({ ok: false, error: "Delivery address incomplete" }, { status: 400 });
    }

    const ids = items.map((i) => i.id).filter(Boolean);
    if (ids.length !== items.length || ids.some((i: string) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(i))) {
      return NextResponse.json({ ok: false, error: "Invalid cart contents — please reload and try again" }, { status: 400 });
    }
    const prods = await db.select().from(products).where(inArray(products.id, ids));
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
    const existing = await db.select().from(orders).where(eq(orders.userId, me.id));
    const reusable = existing.find((o) => o.paymentStatus === "pending" && o.total === total && o.orderStatus === "placed");

    const rzp = getRazorpay();
    if (!rzp) {
      return NextResponse.json({ ok: false, error: "Razorpay not configured on server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.", keyId: "rzp_test_MISSING" }, { status: 500 });
    }

    let order;
    if (reusable?.razorpayOrderId) {
      // Re-use the same Razorpay order (prevents duplicates on retry/refresh)
      order = { id: reusable.razorpayOrderId, amount: inPaise(total), currency: "INR", receipt: reusable.orderNumber };
    } else {
      const receipt = orderNumber();
      // Insert local order in PLACED / PENDING state BEFORE opening Razorpay checkout
      const ins = await db.insert(orders).values({
        userId: me.id, orderNumber: receipt, subtotal, shippingCharge: shipping, discount, total,
        paymentStatus: "pending", orderStatus: "placed",
        trackingNumber: null, courier: null,
        shippingAddress: { name: address.name, phone: address.phone, addressLine: address.addressLine, city: address.city, state: address.state, pincode: address.pincode, landmark: address.landmark || "" },
        paymentMethod: "razorpay",
        customerName: address.name, customerEmail: me.email, customerPhone: address.phone,
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
        await db.update(orders).set({ razorpayOrderId: rzOrder.id }).where(eq(orders.id, ins[0].id));
        order = rzOrder;
      } catch (rzpErr: any) {
        // Roll back local order if Razorpay order creation fails
        await db.delete(orders).where(eq(orders.id, ins[0].id));
        return NextResponse.json({ ok: false, error: "Payment gateway error: " + rzpErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      order,
      amount: total,
      currency: "INR",
      prefill: { name: address.name, email: me.email, contact: address.phone },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
