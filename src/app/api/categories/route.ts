import { publicCategory, publicProduct } from '@/lib/catalog';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";

export async function GET() {
  try {
    const [cats, counts] = await Promise.all([
      db.select().from(categories).where(and(eq(categories.active, true), publicCategory)),
      db.select({ categoryId: products.categoryId, n: sql<number>`count(*)` }).from(products).where(publicProduct).groupBy(products.categoryId),
    ]);
    const map: Record<string, number> = {};
    counts.forEach((c: any) => { if (c.categoryId) map[c.categoryId] = Number(c.n); });
    return NextResponse.json({ ok: true, categories: cats.map((c) => ({ ...c, count: map[c.id] || 0 })) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Unable to complete this request. Please retry.", categories: [] }, { status: 500 });
  }
}
