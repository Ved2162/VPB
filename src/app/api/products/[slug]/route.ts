import { NextResponse } from 'next/server';
import { db } from '@/db';
import { products, categories } from '@/db/schema';
import { and, eq, getTableColumns } from 'drizzle-orm';
import { publicProduct, reviewRating, reviewCount } from '@/lib/catalog';
import { publicReviews } from '@/lib/reviews';
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const [prod] = await db.select({ ...getTableColumns(products), rating: reviewRating, reviewCount,
      categoryName: categories.name, categorySlug: categories.slug }).from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id)).where(and(eq(products.slug, slug), publicProduct));
    if (!prod) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    const related = prod.categoryId ? await db.select({ ...getTableColumns(products), rating: reviewRating, reviewCount }).from(products)
      .where(and(eq(products.categoryId, prod.categoryId), publicProduct)).limit(5) : [];
    return NextResponse.json({ ok: true, product: prod, reviews: await publicReviews(prod.id), related: related.filter(p => p.id !== prod.id).slice(0, 4) });
  } catch { return NextResponse.json({ ok: false, error: 'Unable to load product.' }, { status: 500 }); }
}
