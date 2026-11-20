/**
 * PayU Cancel URL Handler  (curl)
 *
 * PayU POSTs to this URL when the customer explicitly cancels on the PayU
 * hosted checkout page — typically via the "Cancel" or "Back" button that
 * PayU renders on their own page.  This is the ONLY official hook PayU's
 * hosted checkout provides for customer-initiated exits.
 *
 * TECHNICAL REALITY — read before modifying:
 * ─────────────────────────────────────────────
 * PayU's hosted checkout page (https://secure.payu.in/_payment) is a
 * cross-origin page served by PayU.  VPB's JavaScript has no access to it
 * and cannot inject a "beforeunload" handler there.  The only exit mechanism
 * PayU exposes to merchants is the curl (cancel URL) POST redirect.
 *
 * What PayU sends to curl when a customer cancels:
 *   status       = "failure"  (not a distinct "cancelled" value)
 *   unmappedstatus = "usercancelled"  (the meaningful field)
 *   txnid        = the original transaction ID
 *   hash         = must be validated
 *
 * Important: PayU does NOT guarantee it will call curl.  If the customer
 * simply presses the browser Back button without using PayU's cancel button,
 * or closes the tab, curl is not called.  The checkout lock + Leave/Stay
 * modal on the VPB side handles those cases separately.
 *
 * This handler:
 * 1. Validates the PayU hash to authenticate the callback.
 * 2. Calls reconcilePayu() — which queries PayU's verify_payment API to
 *    get the authoritative status.  A curl callback alone is not sufficient
 *    to mark an order failed; we always verify with PayU directly.
 * 3. Redirects the customer to /checkout?paymentOrder=<id>&cancelled=true
 *    so the checkout page shows the Leave/Stay decision UI immediately.
 */

import { processPayuCallback } from '@/lib/payu-callback';
import { deliveryFailure } from '@/lib/delivery-server';
import { payuConfig } from '@/lib/payu';
import { payuLog } from '@/lib/payu-log';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // Parse and validate the callback, then reconcile with PayU's verify API.
    // allowPendingReturn=true so a still-pending transaction redirects rather
    // than throwing — the checkout page will re-verify.
    const order = await processPayuCallback(req, true);
    payuLog('curl_callback_received', { orderId: order.id });
    // Redirect to the checkout page with cancelled=true so the UI knows to
    // surface the Leave/Stay confirmation rather than auto-polling.
    return Response.redirect(
      payuConfig().base +
        '/checkout?paymentOrder=' +
        encodeURIComponent(order.id) +
        '&cancelled=true',
      303
    );
  } catch (error) {
    return deliveryFailure(error);
  }
}

// A GET to this URL means the browser navigated here directly (no PayU POST).
// Redirect to checkout and let the lock mechanism handle recovery.
export async function GET() {
  try {
    return Response.redirect(payuConfig().base + '/checkout', 303);
  } catch (error) {
    return deliveryFailure(error);
  }
}
