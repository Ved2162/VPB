import { db } from '@/db';
import { orders, invoiceCancellations } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { activeUser, deliveryFailure, rateLimit } from '@/lib/delivery-server';
import { DeliveryError, sameOrigin } from '@/lib/shipment-rules';
import { isUuid, readJson } from '@/lib/http-security';
import { ensureInvoice } from '@/lib/invoices';
import { renderInvoicePdf } from '@/lib/invoice-pdf';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authorized(req: Request, id: string) {
  const user = await activeUser(req);
  if (user.role === 'delivery') throw new DeliveryError('Not permitted', 403);
  if (!isUuid(id)) throw new DeliveryError('Order not found', 404);
  const [order] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, id), user.role === 'admin' ? undefined : eq(orders.userId, user.id)));
  if (!order) throw new DeliveryError('Order not found', 404);
  await rateLimit('invoice:' + user.id, 40);
  return user;
}
function failure(error: unknown) {
  const response = deliveryFailure(error);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; await authorized(req, id);
    const invoice = await ensureInvoice(id);
    const [cancelled] = await db.select().from(invoiceCancellations).where(eq(invoiceCancellations.orderId, id));
    const pdf = await renderInvoicePdf(invoice, cancelled);
    const disposition = new URL(req.url).searchParams.get('view') === 'true' ? 'inline' : 'attachment';
    return new Response(new Uint8Array(pdf), { headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${invoice.invoiceNumber.replaceAll('/', '-')}.pdf"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(req); const { id } = await params; const user = await authorized(req, id);
    if (user.role !== 'admin') throw new DeliveryError('Admin only', 403);
    const body = await readJson(req);
    if (body.action !== 'cancel' || typeof body.reason !== 'string' || body.reason.trim().length < 10 || body.reason.trim().length > 500)
      throw new DeliveryError('Provide a cancellation reason between 10 and 500 characters');
    await ensureInvoice(id);
    const inserted = await db.insert(invoiceCancellations).values({ orderId: id, actorId: user.id, reason: body.reason.trim() }).onConflictDoNothing().returning();
    if (!inserted.length) throw new DeliveryError('This receipt is already cancelled', 409);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
