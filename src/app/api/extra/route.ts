import { readJson } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { addresses, reviews, products, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
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
      return NextResponse.json({ ok: true, addresses: rows });
    }
    if (res === "reviews") {
      const pid = u.searchParams.get("productId") || "";
      const rows = pid
        ? await db.select().from(reviews).where(eq(reviews.productId, pid)).orderBy(desc(reviews.createdAt)).limit(50)
        : await db.select().from(reviews).orderBy(desc(reviews.createdAt)).limit(50);
      return NextResponse.json({ ok: true, reviews: rows });
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
    if (body.res === "address") {
      const me = await activeUser(req);
      if (me.role === "delivery") throw new DeliveryError("Customer access required", 403);
      if (!me) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
      const { id, isDefault } = body;
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
        await db.update(addresses).set({ name, phone, addressLine, city, state, pincode, landmark: landmark || null }).where(eq(addresses.id, id));
        return NextResponse.json({ ok: true });
      }
      if (isDefault) await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, me.id));
      const ins = await db.insert(addresses).values({ userId: me.id, name, phone, addressLine, city, state, pincode, landmark: landmark || null, isDefault: !!isDefault }).returning();
      return NextResponse.json({ ok: true, address: ins[0] });
    }
    if (body.res === "review") {
      const me = await activeUser(req);
      if (me.role === "delivery") throw new DeliveryError("Customer access required", 403);
      if (!me) return NextResponse.json({ ok: false, error: "Login required to review" }, { status: 401 });
      const { productId, rating } = body;
      const title = textField(body.title ?? '', 'title', 160), review = textField(body.review ?? '', 'review', 5000);
      await rateLimit('review:' + me.id, 10, 3600);
      if (!isUuid(productId) || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) return NextResponse.json({ ok: false, error: "Rating required" }, { status: 400 });
      await db.insert(reviews).values({ userId: me.id, productId, rating: Number(rating), title: title || null, review: review || null });
      const pr = await db.select().from(products).where(eq(products.id, productId));
      if (pr.length) {
        const all = await db.select().from(reviews).where(eq(reviews.productId, productId));
        const avg = all.reduce((a, r) => a + r.rating, 0) / all.length;
        await db.update(products).set({ rating: avg.toFixed(2), reviewCount: all.length }).where(eq(products.id, productId));
      }
      return NextResponse.json({ ok: true });
    }
    if (body.res === "pincode") {
      const pin = (body.pincode || "").trim();
      if (!/^\d{6}$/.test(pin)) return NextResponse.json({ ok: false, error: "Enter a valid 6-digit pincode" }, { status: 400 });
      return NextResponse.json({ ok: true, eta: "Delivery in 4–6 working days", charge: 99, cod: false });
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
