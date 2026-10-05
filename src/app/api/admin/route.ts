import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, categories, orders, orderItems, users, banners, siteContent } from "@/db/schema";
import { eq, desc, sql, ilike, or } from "drizzle-orm";
import { getUserFromHeader, slugify } from "@/lib/auth";

function needAdmin(req: Request) {
  const me = getUserFromHeader(req);
  if (!me || me.role !== "admin") return null;
  return me;
}

export async function GET(req: Request) {
  if (!needAdmin(req)) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  const u = new URL(req.url);
  const res = u.searchParams.get("res") || "stats";
  const q = (u.searchParams.get("q") || "").trim();
  try {
    if (res === "stats") {
      const pc = await db.select({ n: sql<number>`count(*)` }).from(products);
      const oc = await db.select({ n: sql<number>`count(*)` }).from(orders);
      const uc = await db.select({ n: sql<number>`count(*)` }).from(users);
      const sales = await db.select({ t: sql<number>`coalesce(sum(total),0)` }).from(orders);
      const low = await db.select().from(products).where(sql`stock_quantity <= 15`);
      const recentOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(8);
      const recentUsers = (await db.select().from(users).orderBy(desc(users.createdAt)).limit(6)).map(({ passwordHash: _, ...u }) => u);
      const byStatus = await db.select({ s: orders.orderStatus, n: sql<number>`count(*)` }).from(orders).groupBy(orders.orderStatus);
      return NextResponse.json({ ok: true, stats: { products: Number(pc[0]?.n || 0), orders: Number(oc[0]?.n || 0), customers: Number(uc[0]?.n || 0), sales: Number(sales[0]?.t || 0), low: low.length, out: low.filter((p: any) => p.stockQuantity <= 0).length }, low, recentOrders, recentUsers, byStatus });
    }
    if (res === "products") {
      let rows = await db.select({ p: products, c: categories }).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).orderBy(desc(products.createdAt));
      let data = rows.map((r) => ({ ...r.p, categoryName: r.c?.name }));
      if (q) data = data.filter((p: any) => (p.name + p.sku + (p.brand || "")).toLowerCase().includes(q.toLowerCase()));
      return NextResponse.json({ ok: true, products: data });
    }
    if (res === "categories") return NextResponse.json({ ok: true, categories: await db.select().from(categories).orderBy(categories.sortOrder) });
    if (res === "orders") {
      let all = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(200);
      if (q) all = all.filter((o) => (o.orderNumber + (o.customerName || "") + (o.customerPhone || "")).toLowerCase().includes(q.toLowerCase()));
      const status = u.searchParams.get("status") || "";
      if (status) all = all.filter((o) => o.orderStatus === status);
      return NextResponse.json({ ok: true, orders: all });
    }
    if (res === "order") {
      const id = u.searchParams.get("id") || "";
      const rows = await db.select().from(orders).where(eq(orders.id, id));
      if (!rows.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
      return NextResponse.json({ ok: true, order: { ...rows[0], items } });
    }
    if (res === "customers") {
      let all = await db.select().from(users).orderBy(desc(users.createdAt)).limit(200);
      if (q) all = all.filter((x) => (x.name + x.email + (x.phone || "")).toLowerCase().includes(q.toLowerCase()));
      const withCounts = await Promise.all(all.map(async (x) => {
        const { passwordHash: _, ...safeUser } = x;
        const oo = await db.select({ n: sql<number>`count(*)`, t: sql<number>`coalesce(sum(total),0)` }).from(orders).where(eq(orders.userId, x.id));
        return { ...safeUser, orders: Number(oo[0]?.n || 0), spent: Number(oo[0]?.t || 0) };
      }));
      return NextResponse.json({ ok: true, customers: withCounts });
    }
    if (res === "content") {
      return NextResponse.json({ ok: true, banners: await db.select().from(banners).orderBy(banners.sortOrder), content: await db.select().from(siteContent) });
    }
    return NextResponse.json({ ok: false, error: "unknown" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!needAdmin(req)) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  try {
    const body = await req.json();
    const res = body.res;
    if (res === "product") {
      const d = body.data;
      if (!d.name || !d.price || !d.sku) return NextResponse.json({ ok: false, error: "Name, price, SKU required" }, { status: 400 });
      const slug = d.slug || slugify(d.name);
      const images = Array.isArray(d.images) ? d.images.filter(Boolean) : d.image ? [d.image] : [];
      const payload: any = {
        name: d.name, slug, description: d.description || "", categoryId: d.categoryId || null, brand: d.brand || "VPB",
        cordCount: Number(d.cordCount || 0), reelCount: d.reelCount || null, length: d.length || d.reelCount || null,
        price: Number(d.price), comparePrice: d.comparePrice ? Number(d.comparePrice) : null,
        stockQuantity: Number(d.stockQuantity ?? 10), stockStatus: Number(d.stockQuantity ?? 10) <= 0 ? "out_of_stock" : (d.stockStatus || "in_stock"),
        sku: d.sku, featured: !!d.featured, bestseller: !!d.bestseller, active: d.active !== false,
        images, highlights: d.highlights || [], specs: d.specs || {}, updatedAt: new Date(),
      };
      if (body.id) { await db.update(products).set(payload).where(eq(products.id, body.id)); return NextResponse.json({ ok: true }); }
      const ex = await db.select().from(products).where(or(eq(products.slug, slug), eq(products.sku, d.sku)));
      if (ex.length) return NextResponse.json({ ok: false, error: "Slug or SKU already exists" }, { status: 400 });
      await db.insert(products).values(payload);
      return NextResponse.json({ ok: true });
    }
    if (res === "category") {
      const d = body.data;
      if (!d.name) return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });
      const slug = d.slug || slugify(d.name);
      if (body.id) { await db.update(categories).set({ name: d.name, slug, description: d.description || null, image: d.image || null, active: d.active !== false }).where(eq(categories.id, body.id)); return NextResponse.json({ ok: true }); }
      await db.insert(categories).values({ name: d.name, slug, description: d.description || null, image: d.image || null, active: true });
      return NextResponse.json({ ok: true });
    }
    if (res === "banner") {
      const d = body.data;
      if (body.id) { await db.update(banners).set({ title: d.title, subtitle: d.subtitle, image: d.image, link: d.link, active: d.active !== false }).where(eq(banners.id, body.id)); }
      else await db.insert(banners).values({ title: d.title, subtitle: d.subtitle || "", image: d.image || "", link: d.link || "/shop", active: true });
      return NextResponse.json({ ok: true });
    }
    if (res === "content") {
      const { key, value } = body;
      const ex = await db.select().from(siteContent).where(eq(siteContent.key, key));
      if (ex.length) await db.update(siteContent).set({ value }).where(eq(siteContent.key, key));
      else await db.insert(siteContent).values({ key, value });
      return NextResponse.json({ ok: true });
    }
    if (res === "customer-toggle") {
      await db.update(users).set({ active: body.active }).where(eq(users.id, body.id));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "unknown" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!needAdmin(req)) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  const u = new URL(req.url);
  const res = u.searchParams.get("res");
  const id = u.searchParams.get("id") || "";
  try {
    if (res === "product") await db.delete(products).where(eq(products.id, id));
    else if (res === "category") await db.delete(categories).where(eq(categories.id, id));
    else if (res === "banner") await db.delete(banners).where(eq(banners.id, id));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
