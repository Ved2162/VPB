import 'server-only';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { productImages } from '@/db/schema';

type ImageData = { bytes: Buffer; contentType: string };
// Content-hashed uploads cannot change. Bound memory and coalesce concurrent reads/resizes.
const cache = new Map<string, ImageData>();
const pending = new Map<string, Promise<ImageData | null>>();
const MAX_BYTES = 32 * 1024 * 1024;
let cachedBytes = 0;

async function cached(key: string, load: () => Promise<ImageData | null>) {
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const running = pending.get(key);
  if (running) return running;
  const request = load().then(result => {
    if (result && result.bytes.length <= MAX_BYTES) {
      cache.set(key, result); cachedBytes += result.bytes.length;
      while (cachedBytes > MAX_BYTES || cache.size > 128) {
        const oldest = cache.keys().next().value!;
        cachedBytes -= cache.get(oldest)!.bytes.length;
        cache.delete(oldest);
      }
    }
    return result;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function deliveredProductImage(id: string, width?: number): Promise<ImageData | null> {
  return cached(`${id}:${width || 'original'}:v1`, async () => {
    if (!width) {
      const [image] = await db.select().from(productImages).where(eq(productImages.id, id));
      return image ? { bytes: Buffer.from(image.data, 'base64'), contentType: image.contentType } : null;
    }
    const original = await deliveredProductImage(id);
    if (!original || original.contentType === 'image/gif') return original;
    try {
      // Older catalog uploads include 30 MP photos; keep a bounded legacy decode budget.
      const bytes = await sharp(original.bytes, { limitInputPixels: 40_000_000 })
        .rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
      // Keep originals when compression cannot improve the transfer size.
      return bytes.length < original.bytes.length ? { bytes, contentType: 'image/webp' } : original;
    } catch { return original; }
  });
}
