import { processPayuCallback } from '@/lib/payu-callback';
import { deliveryFailure } from '@/lib/delivery-server';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try { await processPayuCallback(req); return Response.json({ ok: true }); }
  catch (error) { return deliveryFailure(error); }
}
