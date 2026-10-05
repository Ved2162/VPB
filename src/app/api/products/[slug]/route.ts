import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, categories, reviews, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const rows = await db.select({ p: products, c: categories }).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).where(eq(products.slug, slug));
    if (!rows.length) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const prod = { ...rows[0].p, categoryName: rows[0].c?.name, categorySlug: rows[0].c?.slug };
    const revRows = await db.select({ r: reviews, u: users }).from(reviews).leftJoin(users, eq(reviews.userId, users.id)).where(eq(reviews.productId, prod.id));
    const revs = revRows.map((x) => ({ ...x.r, userName: x.u?.name || "VPB Customer" }));
    const rel = prod.categoryId ? await db.select().from(products).where(eq(products.categoryId, prod.categoryId)) : [];
    return NextResponse.json({ ok: true, product: prod, reviews: revs, related: rel.filter((x) => x.id !== prod.id && x.active).slice(0, 4) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
