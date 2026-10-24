import { readJson, isUuid } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { deliveryAudit, reviews, products, categories, orders, orderItems, users, banners, siteContent } from "@/db/schema";
import { eq, desc, sql, or, ne, and, getTableColumns } from "drizzle-orm";
import { slugify } from "@/lib/auth";
import { sameOrigin, DeliveryError } from "@/lib/shipment-rules";
import { activeUser, rateLimit, deliveryFailure } from "@/lib/delivery-server";

async function needAdmin(req: Request) {
  try { const me = await activeUser(req); return me.role === 'admin' ? me : null; }
  catch { return null; }
}

export async function GET(req: Request) {
  if (!(await needAdmin(req))) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  const u = new URL(req.url);
  const res = u.searchParams.get("res") || "stats";
  const q = (u.searchParams.get("q") || "").trim();
  try {
    if (res === "stats") {
      const [pc, oc, uc, sales, low, recentOrders, userRows, byStatus] = await Promise.all([
        db.select({ n: sql<number>`count(*)` }).from(products),
        db.select({ n: sql<number>`count(*)` }).from(orders),
        db.select({ n: sql<number>`count(*)` }).from(users),
        db.select({ t: sql<number>`coalesce(sum(total),0)` }).from(orders),
        db.select().from(products).where(sql`stock_quantity <= 15`),
        db.select().from(orders).orderBy(desc(orders.createdAt)).limit(8),
        db.select({ id: users.id, name: users.name, phone: users.phone, email: users.email, role: users.role, active: users.active, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(6),
        db.select({ s: orders.orderStatus, n: sql<number>`count(*)` }).from(orders).groupBy(orders.orderStatus),
      ]);
      const recentUsers = userRows;
      return NextResponse.json({ ok: true, stats: { products: Number(pc[0]?.n || 0), orders: Number(oc[0]?.n || 0), customers: Number(uc[0]?.n || 0), sales: Number(sales[0]?.t || 0), low: low.length, out: low.filter((p: any) => p.stockQuantity <= 0).length }, low, recentOrders, recentUsers, byStatus });
    }
    if (res === "products") {
      let rows = await db.select({ p: products, c: categories }).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).orderBy(desc(products.createdAt));
      let data = rows.map((r) => ({ ...r.p, categoryName: r.c?.name }));
      if (q) data = data.filter((p: any) => (p.name + p.sku + (p.brand || "")).toLowerCase().includes(q.toLowerCase()));
      return NextResponse.json({ ok: true, products: data });
    }
    if (res === 'reviews') return NextResponse.json({ ok: true, reviews: await db.select({ ...getTableColumns(reviews), productName: products.name }).from(reviews).leftJoin(products, eq(products.id, reviews.productId)).orderBy(desc(reviews.createdAt)).limit(200) });
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
    return deliveryFailure(e);
  }
}

export async function POST(req: Request) {
  try { sameOrigin(req); } catch (error) { return deliveryFailure(error); }
  const admin = await needAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  try {
    const body = await readJson(req);
    await rateLimit("admin-write:" + admin.id, 90, 60);
    if (body.id && !isUuid(body.id)) throw new DeliveryError('Invalid record ID');
    const res = body.res;
    return await db.transaction(async tx => {
      const [current] = await tx.select().from(users).where(eq(users.id, admin.id)).for('share');
      if (!current?.active || current.role !== 'admin' || current.sessionVersion !== admin.sessionVersion) throw new DeliveryError('Admin session is no longer valid', 403);
      const apply = async () => {
    if (res === 'review') {
      if (!isUuid(body.id) || !['approved', 'rejected', 'pending'].includes(body.status)) throw new DeliveryError('Invalid review moderation');
      const [saved] = await tx.update(reviews).set({ status: body.status }).where(eq(reviews.id, body.id)).returning({ id: reviews.id });
      if (!saved) throw new DeliveryError('Review not found', 404);
      return NextResponse.json({ ok: true });
    }
    if (res === "product") {
      const d = body.data;
      if (!d || typeof d.name !== "string" || d.name.length > 200 || !Number.isSafeInteger(Number(d.price)) || Number(d.price) < 1 || !d.sku || !Number.isInteger(Number(d.stockQuantity ?? 10)) || Number(d.stockQuantity ?? 10) < 0) return NextResponse.json({ ok: false, error: "Name, price, SKU required" }, { status: 400 });
      const slug = d.slug || slugify(d.name);
      if (d.active !== false && /\b(kites?|patangs?)\b/i.test(d.name) && !/\b(manjha|saddi|charkhi)\b/i.test(d.name)) throw new DeliveryError('Kite products must remain inactive');
      if (d.categoryId && d.active !== false) {
        const [category] = await tx.select().from(categories).where(eq(categories.id, d.categoryId));
        if (category && /(^|-)(kites?|patangs?)(-|$)/i.test(category.slug)) throw new DeliveryError('Choose a manjha or accessories category');
      }
      const images = Array.isArray(d.images) ? d.images.filter(Boolean) : d.image ? [d.image] : [];
      const payload: any = {
        name: d.name, slug, description: d.description || "", categoryId: d.categoryId || null, brand: d.brand || "VPB",
        cordCount: Number(d.cordCount || 0), reelCount: d.reelCount || null, length: d.length || d.reelCount || null,
        price: Number(d.price), comparePrice: d.comparePrice ? Number(d.comparePrice) : null,
        stockQuantity: Number(d.stockQuantity ?? 10), stockStatus: Number(d.stockQuantity ?? 10) <= 0 ? "out_of_stock" : (d.stockStatus || "in_stock"),
        sku: d.sku, featured: !!d.featured, bestseller: !!d.bestseller, active: d.active !== false,
        images, highlights: d.highlights || [], specs: d.specs || {}, updatedAt: new Date(),
      };
      if (body.id) {
        const [saved] = await tx.update(products).set(payload).where(eq(products.id, body.id)).returning({ id: products.id });
        if (!saved) return NextResponse.json({ ok: false, error: "Product no longer exists. Reload and try again." }, { status: 404 });
        return NextResponse.json({ ok: true, id: saved.id });
      }
      const ex = await tx.select().from(products).where(or(eq(products.slug, slug), eq(products.sku, d.sku)));
      if (ex.length) return NextResponse.json({ ok: false, error: "Slug or SKU already exists" }, { status: 400 });
      const [saved] = await tx.insert(products).values(payload).returning({ id: products.id });
      return NextResponse.json({ ok: true, id: saved.id });
    }
    if (res === "category") {
      const d = body.data;
      if (!d || typeof d.name !== 'string' || !d.name.trim()) return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });
      const slug = d.slug || slugify(d.name);
      if (d.active !== false && /(^|-)(kites?|patangs?)(-|$)/i.test(slug)) throw new DeliveryError('Kite categories must remain inactive');
      const payload = { name: d.name, slug, description: d.description || null, image: d.image || null, active: d.active !== false };
      const [saved] = body.id ? await tx.update(categories).set(payload).where(eq(categories.id, body.id)).returning({ id: categories.id }) : await tx.insert(categories).values(payload).returning({ id: categories.id });
      if (!saved) throw new DeliveryError('Category not found', 404);
      return NextResponse.json({ ok: true, id: saved.id });
    }
    if (res === "banner") {
      const d = body.data;
      if (!d || typeof d.title !== 'string' || !d.title.trim()) throw new DeliveryError('Title required');
      const payload = { title: d.title, subtitle: d.subtitle || '', image: d.image || '', link: d.link || '/shop', active: d.active !== false };
      const [saved] = body.id ? await tx.update(banners).set(payload).where(eq(banners.id, body.id)).returning({ id: banners.id }) : await tx.insert(banners).values(payload).returning({ id: banners.id });
      if (!saved) throw new DeliveryError('Banner not found', 404);
      return NextResponse.json({ ok: true, id: saved.id });
    }
    if (res === "content") {
      const { key, value } = body;
      if (typeof key !== 'string' || !key.trim() || key.length > 80 || typeof value !== 'string') throw new DeliveryError('Content key and value required');
      const [saved] = await tx.insert(siteContent).values({ key, value }).onConflictDoUpdate({ target: siteContent.key, set: { value, updatedAt: new Date() } }).returning({ id: siteContent.id });
      return NextResponse.json({ ok: true, id: saved.id });
    }
    if (res === "customer-toggle") {
      if (!isUuid(body.id) || typeof body.active !== 'boolean') throw new DeliveryError('Customer ID and active status required');
      const [saved] = await tx.update(users).set({ active: body.active, sessionVersion: sql`${users.sessionVersion} + 1` }).where(and(eq(users.id, body.id), ne(users.role, 'admin'))).returning({ id: users.id });
      if (!saved) throw new DeliveryError('Customer not found', 404);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "unknown" }, { status: 400 });
      };
      const response = await apply();
      const result = await response.clone().json();
      const target = result.id || body.id;
      if (response.ok && result.ok && isUuid(target)) await tx.insert(deliveryAudit).values({ actorId: admin.id,
        resource: res === 'customer-toggle' ? 'customer' : String(res), resourceId: target,
        changes: { operation: res === 'customer-toggle' ? 'set_active' : body.id ? 'update' : 'create', outcome: 'success' },
      });
      return response;
    });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}

export async function DELETE(req: Request) {
  try { sameOrigin(req); } catch (error) { return deliveryFailure(error); }
  const admin = await needAdmin(req);
  if (!admin) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  const u = new URL(req.url);
  const res = u.searchParams.get("res");
  const id = u.searchParams.get("id") || "";
  try {
    if (!isUuid(id)) throw new DeliveryError('Invalid record ID');
    await rateLimit('admin-write:' + admin.id, 90, 60);
    return await db.transaction(async tx => {
    const [current] = await tx.select().from(users).where(eq(users.id, admin.id)).for('share');
    if (!current?.active || current.role !== 'admin' || current.sessionVersion !== admin.sessionVersion) throw new DeliveryError('Admin session expired', 401);
    let deleted;
    if (res === "product") [deleted] = await tx.delete(products).where(eq(products.id, id)).returning({ id: products.id });
    else if (res === "category") [deleted] = await tx.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id });
    else if (res === "banner") [deleted] = await tx.delete(banners).where(eq(banners.id, id)).returning({ id: banners.id });
    else throw new DeliveryError('Unknown resource');
    if (!deleted) throw new DeliveryError('Record not found', 404);
    await tx.insert(deliveryAudit).values({ actorId: admin.id, resource: String(res), resourceId: id, changes: { operation: 'delete', outcome: 'success' } });
    return NextResponse.json({ ok: true });
    });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}
