import { processPayuCallback } from '@/lib/payu-callback';
import { deliveryFailure } from '@/lib/delivery-server';
import { payuConfig } from '@/lib/payu';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const order = await processPayuCallback(req, true);
    // Redirect is navigation only. The authenticated result view verifies again.
    return Response.redirect(payuConfig().base + '/checkout?paymentOrder=' + encodeURIComponent(order.id), 303);
  } catch (error) {
    return deliveryFailure(error);
  }
}

// A GET return carries no authenticated payment result. Restore the saved order
// in the browser and verify it through the owned-order API.
export async function GET() {
  try { return Response.redirect(payuConfig().base + '/checkout', 303); }
  catch (error) { return deliveryFailure(error); }
}
