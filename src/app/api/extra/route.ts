import { NextResponse } from "next/server";
import { db } from "@/db";
import { addresses, reviews, products, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserFromHeader } from "@/lib/auth";

// ?res=addresses|reviews  — unified to save routes
export async function GET(req: Request) {
  const u = new URL(req.url);
  const res = u.searchParams.get("res");
  const me = getUserFromHeader(req);
  try {
    if (res === "addresses") {
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
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const me = getUserFromHeader(req);
  try {
    if (body.res === "address") {
      if (!me) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
      const { id, name, phone, addressLine, city, state, pincode, landmark, isDefault } = body;
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
      if (!me) return NextResponse.json({ ok: false, error: "Login required to review" }, { status: 401 });
      const { productId, rating, title, review } = body;
      if (!productId || !rating) return NextResponse.json({ ok: false, error: "Rating required" }, { status: 400 });
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
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const u = new URL(req.url);
  const me = getUserFromHeader(req);
  if (!me) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
  const id = u.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ ok: false, error: "Address ID required" }, { status: 400 });
  // Ownership check — only delete if the address belongs to this user
  const existing = await db.select().from(addresses).where(eq(addresses.id, id));
  if (!existing.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (existing[0].userId !== me.id) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  await db.delete(addresses).where(eq(addresses.id, id));
  return NextResponse.json({ ok: true });
}
