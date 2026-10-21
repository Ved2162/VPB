import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { productImages } from '@/db/schema';
import { activeUser, deliveryFailure, rateLimit } from '@/lib/delivery-server';
import { sameOrigin, DeliveryError } from '@/lib/shipment-rules';
import { readBytes } from '@/lib/http-security';
import { imageContentType, MAX_IMAGE_BYTES } from '@/lib/product-images';

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const me = await activeUser(req);
    if (me.role !== 'admin') throw new DeliveryError('Admin only', 403);
    await rateLimit('admin-image:' + me.id, 60, 60);
    const bytes = await readBytes(req, MAX_IMAGE_BYTES);
    const contentType = imageContentType(bytes);
    if (!contentType) throw new DeliveryError('Choose a JPEG, PNG, WebP or GIF image', 400);
    const id = createHash('sha256').update(bytes).digest('hex');
    await db.insert(productImages).values({ id, contentType, data: Buffer.from(bytes).toString('base64') }).onConflictDoNothing();
    return NextResponse.json({ ok: true, url: '/api/images/' + id });
  } catch (error) { return deliveryFailure(error); }
}
