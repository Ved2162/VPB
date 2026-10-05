import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { and, or, ilike, eq, gte, lte, desc, asc, sql } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const q = (u.searchParams.get("q") || "").trim();
    const cat = u.searchParams.get("cat") || "";
    const cord = u.searchParams.get("cord") || "";
    const min = Number(u.searchParams.get("min") || 0);
    const max = Number(u.searchParams.get("max") || 0);
    const sort = u.searchParams.get("sort") || "featured";
    const tag = u.searchParams.get("tag") || "";
    const avail = u.searchParams.get("avail") || "";
    const limit = Math.min(Number(u.searchParams.get("limit") || 60), 100);

    const conds: any[] = [eq(products.active, true)];
    if (q) {
      conds.push(or(ilike(products.name, `%${q}%`), ilike(products.brand, `%${q}%`), ilike(products.sku, `%${q}%`), ilike(products.description, `%${q}%`))!);
    }
    if (cat) {
      const c = await db.select().from(categories).where(eq(categories.slug, cat));
      if (c.length) conds.push(eq(products.categoryId, c[0].id));
      else conds.push(sql`1=0`);
    }
    if (cord) conds.push(eq(products.cordCount, Number(cord)));
    if (min) conds.push(gte(products.price, min));
    if (max) conds.push(lte(products.price, max));
    if (tag === "featured") conds.push(eq(products.featured, true));
    if (tag === "bestseller") conds.push(eq(products.bestseller, true));
    if (avail === "in") conds.push(eq(products.stockStatus, "in_stock"));
    if (avail === "out") conds.push(eq(products.stockStatus, "out_of_stock"));

    let order: any = desc(products.createdAt);
    if (sort === "price_asc") order = asc(products.price);
    if (sort === "price_desc") order = desc(products.price);
    if (sort === "rating") order = desc(products.rating);
    if (sort === "name") order = asc(products.name);

    const rows = await db.select({ p: products, c: categories }).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).where(and(...conds)).orderBy(order).limit(limit);
    const data = rows.map((r) => ({ ...r.p, categoryName: r.c?.name || null, categorySlug: r.c?.slug || null }));
    return NextResponse.json({ ok: true, products: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, products: [] }, { status: 500 });
  }
}
