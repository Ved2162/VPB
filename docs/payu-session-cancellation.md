# PayU Payment Session Cancellation & Recovery System

## Overview

VPB implements a sophisticated Leave/Stay confirmation system to handle cases where customers return to the checkout page while their PayU payment session is still active or processing.

## Problem Statement

When customers navigate away from the PayU payment gateway (by closing the tab, pressing back, or the payment timing out), they may return to VPB checkout with a pending payment session. Without proper handling, this creates confusion:

- Customer doesn't know if they should retry payment
- System doesn't know if previous payment succeeded
- Duplicate payments may be attempted
- Inventory may be unnecessarily reserved

## Solution Architecture

### Leave/Stay Confirmation Modal

When a customer returns to checkout with a pending payment session, they see a professional modal with two options:

**Stay & Complete Payment:**
- Reopens the existing PayU checkout session
- Reuses the same order ID and transaction
- Prevents duplicate orders

**Leave & Cancel Payment:**
- Verifies current payment status with PayU
- Handles the session based on actual payment state
- Never assumes cancellation without PayU confirmation

### PayU Cancellation Limitations

**Important:** PayU's `cancel_transaction` API **only works for**:
- Pre-authorized card payments (auth-and-capture flow)
- UPI One-Time Mandates
- UPI recurring mandates
- QR code transactions

**It does NOT work for:**
- Standard hosted checkout payments (what VPB uses)
- Already captured transactions
- Non-preauth card payments

### Verification-Based Approach

Since VPB uses standard hosted checkout, we cannot directly cancel transactions via API. Instead, we use a verification-based approach:

1. **Customer clicks "Leave & Cancel Payment"**
2. **Backend calls PayU's verification API** to check current status
3. **Handle based on actual PayU response:**

| PayU Status | VPB Action | Result |
|---|---|---|
| Success/Captured | Finalize payment as paid | Order confirmed, customer redirected to success |
| Failed/Cancelled/Bounced | Mark as failed, release stock | Session cancelled, retry allowed |
| Pending/In Progress | Keep as pending | Show "still processing" message |
| Verification timeout | Return verification_unavailable | Prompt manual check later |

## Implementation Details

### Frontend Components

**`src/components/payment-session-modal.tsx`**
- Premium modal following VPB design system
- Cream background, maroon accents
- Two clear action buttons
- Loading state during verification
- Fully responsive

**`src/app/checkout/page.tsx` (modifications)**
- Detects return from PayU via URL param `?paymentOrder={orderId}`
- Shows modal on first return (uses `hasShownSessionModal` ref to prevent duplicates)
- Handles both Stay and Leave actions
- Updates UI based on cancellation result

### Backend API

**`src/app/api/payment/cancel-session/route.ts`**
- Rate-limited: 10 requests per 60 seconds per user
- Verifies user owns the order (security)
- Acquires database locks to prevent race conditions
- Calls PayU verification API to determine actual status
- Returns structured response with status and message

**Response format:**
```typescript
{
  ok: boolean;
  status: 'already_paid' | 'verified_paid' | 'verified_failed' | 'still_pending' | 'verification_unavailable';
  paymentStatus: 'paid' | 'failed' | 'pending';
  message: string;
  orderId: string;
  orderNumber: string;
  canRetry?: boolean;
}
```

### Database Transactions

Uses row-level locking to prevent race conditions:
```typescript
const [order] = await tx.select()
  .from(orders)
  .where(and(eq(orders.id, orderId), eq(orders.userId, me.id)))
  .for('update');
```

This ensures:
- Only one process can modify the order at a time
- Webhook and cancellation don't conflict
- Payment status transitions are atomic

### Logging

All cancellation attempts are logged via `payuLog()`:
- `cancel_session_verify` - Verification initiated
- `cancel_session_found_paid` - Payment was actually successful
- `cancel_session_confirmed_failed` - Payment confirmed failed
- `cancel_session_still_pending` - PayU hasn't finalized
- `cancel_session_verify_failed` - Verification API error
- `cancel_session_error` - General error

Logs include: orderId, txnid, requestedBy (userId), error details (no PII or credentials)

## User Experience Flow

### Scenario 1: Customer Closes PayU Tab

1. Customer at PayU checkout → closes browser tab
2. Returns to VPB checkout → sees Leave/Stay modal
3. Clicks "Leave & Cancel Payment"
4. Backend verifies with PayU → finds "usercancelled" status
5. Order marked as failed, stock released
6. Customer sees: "Payment session cancelled successfully. You can try again whenever you're ready."
7. Retry button enabled

### Scenario 2: Payment Actually Succeeded

1. Customer completes payment at PayU → network issue prevents redirect
2. Manually navigates to VPB checkout → sees Leave/Stay modal
3. Clicks "Leave & Cancel Payment" (thinking payment failed)
4. Backend verifies with PayU → finds "captured" status!
5. Order finalized as paid, stock allocated
6. Customer sees: "Your payment was successfully completed!"
7. Redirected to order confirmation

### Scenario 3: Payment Still Processing

1. Customer initiated UPI payment → app hasn't responded yet
2. Returns to VPB checkout → sees Leave/Stay modal
3. Clicks "Leave & Cancel Payment"
4. Backend verifies with PayU → finds "pending" status
5. Order remains pending (no cancellation)
6. Customer sees: "Your payment is still being processed. Please wait while we verify its status."
7. Manual "Check payment status" button shown

### Scenario 4: Customer Wants to Continue

1. Customer accidentally closed PayU → wants to complete payment
2. Returns to VPB checkout → sees Leave/Stay modal
3. Clicks "Stay & Complete Payment"
4. Modal closes, existing payment session reopened
5. Customer redirected back to PayU with same order ID
6. No duplicate order created

## Duplicate Payment Prevention

Multiple layers prevent duplicate payments:

1. **Idempotency Keys:** `checkoutKey` (UUID) prevents duplicate order creation from same browser session
2. **Cart Fingerprinting:** Reuses existing order if cart/address match exactly
3. **Verification-First Retry:** Blocks retry if previous txnId is still pending
4. **Database Locks:** Row-level locks prevent concurrent modifications
5. **Webhook Idempotency:** Checks if payment already processed before finalizing

## Browser Navigation Handling

**Page Refresh:**
- Pending order restored from sessionStorage `vpb-payu-order`
- Automatic verification polling resumes (up to 5 attempts)
- Modal NOT shown on refresh (only on initial return)

**Back Button:**
- Same as closing tab - pending session detected
- Modal shown on return to checkout
- Verification-based handling applies

**Duplicate Tab:**
- Each tab has own sessionStorage
- Only one tab can modify order (database lock)
- Second tab sees verification result from first

## Testing Scenarios

### Test Case 1: Customer Returns and Clicks Stay
**Steps:**
1. Start checkout, click "Continue to PayU"
2. Close PayU tab without paying
3. Return to VPB checkout
4. See Leave/Stay modal → click "Stay & Complete Payment"

**Expected:**
- Modal closes
- Same PayU session reopens
- Same order ID used (no duplicate)
- Payment can be completed normally

### Test Case 2: Customer Returns and Clicks Leave
**Steps:**
1. Start checkout, click "Continue to PayU"
2. Close PayU tab without paying
3. Return to VPB checkout
4. See Leave/Stay modal → click "Leave & Cancel Payment"

**Expected:**
- Modal shows loading: "Checking payment status..."
- Backend verifies with PayU
- Order marked as failed (if PayU confirms cancellation)
- Stock released
- Message: "Payment session cancelled successfully"
- Retry button enabled

### Test Case 3: PayU Confirms Cancellation
**Setup:** PayU returns status="failed", unmappedstatus="usercancelled"

**Expected:**
- `payuAttempts.status` → 'failed'
- `payuAttempts.verifiedAt` → current timestamp
- `orders.paymentStatus` → 'failed'
- Inventory reservation released
- Response: `{status: 'verified_failed', paymentStatus: 'failed'}`

### Test Case 4: PayU Confirms Success
**Setup:** PayU returns status="success", unmappedstatus="captured"

**Expected:**
- `payuAttempts.status` → 'paid'
- `payuAttempts.paymentId` → mihpayid from PayU
- `orders.paymentStatus` → 'paid'
- `orders.orderStatus` → 'confirmed' (if stock available)
- Stock allocated permanently
- Order notification scheduled
- Response: `{status: 'verified_paid', paymentStatus: 'paid'}`

### Test Case 5: Customer Payment Succeeds While Checking
**Setup:** Customer completes PayU payment, then immediately clicks Leave

**Expected:**
- Backend verification finds 'captured' status
- Payment finalized despite "cancel" request
- Customer redirected to success page
- Toast: "Payment was successfully completed!"
- No cancellation occurs (payment state is source of truth)

### Test Case 6: Customer Closes PayU Tab
**Steps:**
1. Customer on PayU payment page
2. Closes browser tab completely
3. Later returns to VPB, logs in
4. Checkout detects pending order → shows modal

**Expected:**
- Modal appears automatically
- Leave → verification finds "usercancelled" or "pending"
- Stay → reopens same payment session

### Test Case 7: Customer Refreshes Checkout Page
**Steps:**
1. Customer on checkout with pending payment
2. Presses F5 / Cmd+R to refresh
3. Page reloads

**Expected:**
- Pending order restored from sessionStorage
- Automatic verification polling starts
- Modal does NOT show (hasShownSessionModal=true persists in ref)
- Status indicator shown based on current payment state

### Test Case 8: PayU Sends Duplicate Webhooks
**Setup:** PayU webhook fires twice for same transaction

**Expected:**
- First webhook: Processes normally, finalizes payment
- Second webhook: Acquires order lock, sees status='paid', returns early (no-op)
- No duplicate stock allocation
- No duplicate notifications
- Idempotent result

### Test Case 9: Retry While Previous Transaction Pending
**Steps:**
1. Start payment, leave PayU without completing
2. Click "Leave", PayU verification returns "pending"
3. Immediately click retry

**Expected:**
- Retry blocked by `preparePayuCheckout()`
- Returns `{ok: true, needsVerification: true}`
- Frontend shows: "needs verification" message
- No new payuAttempts record created
- Manual verification required first

## Security Considerations

1. **User Verification:** Cancel-session API verifies `orders.userId` matches authenticated user
2. **Rate Limiting:** 10 requests per minute per user prevents abuse
3. **Order Locking:** Row-level locks prevent race conditions
4. **No Client-Side Cancellation:** Frontend never directly marks payment as cancelled
5. **Hash Validation:** All PayU responses validated with SHA-512 hash
6. **Amount Verification:** Ensures PayU amount matches order total
7. **Environment Checks:** Prevents sandbox transactions from affecting production

## Configuration

No additional configuration required. The system uses existing:
- PayU merchant key and salt (from environment variables)
- Database schema (orders, payuAttempts tables)
- Existing verification API integration

## Monitoring

Track these metrics:
- `cancel_session_verify` count - how often customers click Leave
- `cancel_session_found_paid` count - payments completed despite "cancel" click
- `cancel_session_verified_failed` count - actual cancellations confirmed
- `cancel_session_still_pending` count - payments that couldn't be finalized
- `cancel_session_verify_failed` count - PayU API failures

## Known Limitations

1. **Cannot Force Cancellation:** If PayU shows "pending", we cannot force cancel it
2. **Verification Dependency:** Relies on PayU's verification API availability
3. **UPI Timing:** UPI payments may stay pending for extended periods (bank-dependent)
4. **No Pre-Auth:** VPB doesn't use pre-auth flow, so auth-specific cancellation APIs don't apply
5. **Webhook Timing:** If webhook hasn't arrived yet, verification is source of truth

## Future Enhancements

1. **Webhook Priority:** If webhook already processed payment, skip verification API call
2. **Retry Backoff:** Implement exponential backoff for "still pending" cases
3. **Customer Notification:** Send SMS/email when payment status changes
4. **Admin Dashboard:** Show all pending cancellation requests for manual review
5. **Analytics:** Track which payment methods have highest cancellation rates

## Related Documentation

- [PayU Integration](./payu-migration.md)
- [Payment Verification Flow](./payment-verification.md)
- [Inventory Reservation System](./inventory-reservations.md)
- [Security Audit Report](./security.md)
