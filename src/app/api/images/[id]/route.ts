import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { productImages } from '@/db/schema';
import { deliveryFailure } from '@/lib/delivery-server';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(id)) return new Response('Not found', { status: 404 });
    const [image] = await db.select().from(productImages).where(eq(productImages.id, id));
    if (!image) return new Response('Not found', { status: 404 });
    return new Response(Buffer.from(image.data, 'base64'), { headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return deliveryFailure(error); }
}
