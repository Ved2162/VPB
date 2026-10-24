import { db } from '@/db';
import { reviews, users } from '@/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
export async function publicReviews(productId?: string) {
  return db.select({ id: reviews.id, productId: reviews.productId, rating: reviews.rating, title: reviews.title,
    review: reviews.review, language: reviews.language, createdAt: reviews.createdAt, userName: users.name,
    verifiedPurchase: sql<boolean>`EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = ${reviews.productId} AND o.user_id = ${reviews.userId}
      AND o.payment_status = 'paid' AND o.order_status <> 'cancelled')`
  }).from(reviews).leftJoin(users, eq(users.id, reviews.userId))
    .where(and(eq(reviews.status, 'approved'), eq(reviews.isDemo, false), sql`${reviews.rating} BETWEEN 1 AND 5`, productId ? eq(reviews.productId, productId) : undefined))
    .orderBy(desc(reviews.createdAt)).limit(50);
}
