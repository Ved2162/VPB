import { deliveredProductImage } from '@/lib/product-image-delivery';
import { PRODUCT_IMAGE_WIDTHS } from '@/lib/product-images';
import { deliveryFailure } from '@/lib/delivery-server';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(id)) return new Response('Not found', { status: 404 });
    const requestedWidth = new URL(req.url).searchParams.get('w');
    const width = requestedWidth === null ? undefined : Number(requestedWidth);
    if (width !== undefined && !PRODUCT_IMAGE_WIDTHS.some(allowed => allowed === width)) return new Response('Unsupported image width', { status: 400 });
    const image = await deliveredProductImage(id, width);
    if (!image) return new Response('Not found', { status: 404 });
    const headers = {
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${id}-${width || 'original'}-v1"`,
    };
    if (req.headers.get('if-none-match') === headers.ETag) return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(image.bytes), { headers });
  } catch (error) { return deliveryFailure(error); }
}
