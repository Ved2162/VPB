import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  try {
    const cats = await db.select().from(categories);
    const counts = await db.select({ categoryId: products.categoryId, n: sql<number>`count(*)` }).from(products).groupBy(products.categoryId);
    const map: Record<string, number> = {};
    counts.forEach((c: any) => { if (c.categoryId) map[c.categoryId] = Number(c.n); });
    return NextResponse.json({ ok: true, categories: cats.map((c) => ({ ...c, count: map[c.id] || 0 })) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, categories: [] }, { status: 500 });
  }
}
