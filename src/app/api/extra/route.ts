import { paymentEmail } from '@/lib/payu';
import { publicReviews } from '@/lib/reviews';
import { publicProduct } from '@/lib/catalog';
import { readJson } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { addresses, reviews, products, users, orders } from "@/db/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import { activeUser, rateLimit, deliveryFailure } from '@/lib/delivery-server';
import { sameOrigin, textField, DeliveryError } from '@/lib/shipment-rules';
import { isUuid } from '@/lib/http-security';

// ?res=addresses|reviews  — unified to save routes
export async function GET(req: Request) {
  const u = new URL(req.url);
  const res = u.searchParams.get("res");

  try {
    if (res === "addresses") {
      const me = await activeUser(req);
      if (me.role === "delivery") throw new DeliveryError("Customer access required", 403);
      if (!me) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
      const rows = await db.select().from(addresses).where(eq(addresses.userId, me.id)).orderBy(desc(addresses.createdAt));
      let email: string | null = null;
      try { email = paymentEmail(me.email); } catch { /* Older OTP profiles can lack email. */ }
      if (!email) {
        const previous = await db.select({ email: orders.customerEmail }).from(orders).where(and(eq(orders.userId, me.id), isNotNull(orders.customerEmail))).orderBy(desc(orders.createdAt)).limit(5);
        for (const order of previous) { try { email = paymentEmail(order.email); break; } catch { /* Skip invalid historical contact data. */ } }
      }
      return NextResponse.json({ ok: true, addresses: rows, email });
    }
    if (res === "reviews") {
      const pid = u.searchParams.get("productId") || "";
      if (pid && !isUuid(pid)) throw new DeliveryError('Invalid product ID');
      return NextResponse.json({ ok: true, reviews: await publicReviews(pid || undefined) });
    }
    return NextResponse.json({ ok: false, error: "unknown res" }, { status: 400 });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await readJson(req);
    if (body.res === 'checkout_contact') {
      const me = await activeUser(req);
      if (me.role === 'delivery') throw new DeliveryError('Customer access required', 403);
      const email = paymentEmail(body.email);
      await rateLimit('checkout-contact:' + me.id, 30, 60);
      const [saved] = await db.update(users).set({ email }).where(and(eq(users.id, me.id), eq(users.active, true), eq(users.sessionVersion, me.sessionVersion))).returning({ id: users.id });
      if (!saved) throw new DeliveryError('Session expired. Please log in again', 401);
      return NextResponse.json({ ok: true });
    }
    if (body.res === "address") {
      const me = await activeUser(req);
      if (me.role === "delivery") throw new DeliveryError("Customer access required", 403);
      if (!me) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
      const { id, isDefault } = body;
      const email = body.email === undefined ? undefined : paymentEmail(body.email);
      if (id && !isUuid(id)) throw new DeliveryError('Invalid address ID');
      const name = textField(body.name, 'name', 120, true), phone = textField(body.phone, 'phone', 20, true), addressLine = textField(body.addressLine, 'address', 220, true), city = textField(body.city, 'city', 100, true), state = textField(body.state, 'state', 100, true), pincode = textField(body.pincode, 'pincode', 10, true), landmark = textField(body.landmark ?? '', 'landmark', 200);
      if (!/^\d{6}$/.test(pincode) || !/^\+?[0-9]{7,15}$/.test(phone)) throw new DeliveryError('Invalid phone or pincode');
      await rateLimit('address:' + me.id, 30, 60);
      if (!name || !phone || !addressLine || !city || !state || !pincode) return NextResponse.json({ ok: false, error: "All address fields required" }, { status: 400 });
      if (id) {
        // Ownership check for updates
        const existing = await db.select().from(addresses).where(eq(addresses.id, id));
        if (!existing.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
        if (existing[0].userId !== me.id) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
        await db.transaction(async tx => {
          await tx.update(addresses).set({ name, phone, addressLine, city, state, pincode, landmark: landmark || null }).where(eq(addresses.id, id));
          if (email) await tx.update(users).set({ email }).where(eq(users.id, me.id));
        });
        return NextResponse.json({ ok: true });
      }
      return await db.transaction(async tx => {
        if (isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, me.id));
        const [address] = await tx.insert(addresses).values({ userId: me.id, name, phone, addressLine, city, state, pincode, landmark: landmark || null, isDefault: !!isDefault }).returning();
        if (email) await tx.update(users).set({ email }).where(eq(users.id, me.id));
        return NextResponse.json({ ok: true, address });
      });
    }
    if (body.res === "review") {
      const me = await activeUser(req);
      if (me.role === "delivery") throw new DeliveryError("Customer access required", 403);
      if (!me) return NextResponse.json({ ok: false, error: "Login required to review" }, { status: 401 });
      const { productId, rating } = body;
      const title = textField(body.title ?? '', 'title', 160), review = textField(body.review ?? '', 'review', 5000);
      await rateLimit('review:' + me.id, 10, 3600);
      if (!isUuid(productId) || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) return NextResponse.json({ ok: false, error: "Rating required" }, { status: 400 });
      if (!review.trim()) throw new DeliveryError('Please write a review');
      const language = body.language ?? 'en';
      if (!['en', 'hi-Latn', 'gu-Latn'].includes(language)) throw new DeliveryError('Invalid review language');
      const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), publicProduct));
      if (!product) throw new DeliveryError('Product unavailable', 404);
      await db.transaction(async tx => {
        const [current] = await tx.select().from(users).where(eq(users.id, me.id)).for('update');
        if (!current?.active || current.sessionVersion !== me.sessionVersion || current.role === 'delivery') throw new DeliveryError('Customer session expired', 401);
      const [previous] = await tx.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.userId, me.id), eq(reviews.productId, productId)));
      if (previous) throw new DeliveryError('You have already submitted a review for this product', 409);
      await tx.insert(reviews).values({ userId: me.id, productId, rating: Number(rating), title: title || null, review, language, status: 'pending', isDemo: false });
      });
      return NextResponse.json({ ok: true });
    }
    if (body.res === "pincode") {
      const pin = (body.pincode || "").trim();
      if (!/^\d{6}$/.test(pin)) return NextResponse.json({ ok: false, error: "Enter a valid 6-digit pincode" }, { status: 400 });
      return NextResponse.json({ ok: true, eta: "Delivery in 4–6 working days", charge: 0, cod: false });
    }
    return NextResponse.json({ ok: false, error: "unknown" }, { status: 400 });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}

export async function DELETE(req: Request) {
  try {
  sameOrigin(req);
  const u = new URL(req.url);

  const me = await activeUser(req);
      if (me.role === "delivery") throw new DeliveryError("Customer access required", 403);
      if (!me) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
  const id = u.searchParams.get("id") || "";
  if (!isUuid(id)) throw new DeliveryError("Invalid address ID");
  if (!id) return NextResponse.json({ ok: false, error: "Address ID required" }, { status: 400 });
  // Ownership check — only delete if the address belongs to this user
  const existing = await db.select().from(addresses).where(eq(addresses.id, id));
  if (!existing.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (existing[0].userId !== me.id) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  await db.delete(addresses).where(eq(addresses.id, id));
  return NextResponse.json({ ok: true });
  } catch (error) { return deliveryFailure(error); }
}
