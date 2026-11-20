# VPB PayU Checkout Lock Mechanism

## Overview

The Checkout Lock Mechanism ensures that once a customer is redirected to PayU, they cannot initiate another payment until the current session is resolved. This prevents duplicate payments, race conditions, and customer confusion.

---

## Problem Statement

Without checkout locking, customers can:
1. Start a PayU payment
2. Press back or close the tab
3. Return to VPB checkout
4. Start another payment (duplicate!)
5. Complete both payments → charged twice

Additional issues:
- Multiple browser tabs can create concurrent payment attempts
- Page refresh can bypass frontend-only locks
- Race conditions between payment success and new attempts

---

## Solution: Persistent Backend Lock

### Key Principles

1. **Backend-Enforced:** Lock stored in database, not just frontend state
2. **Persistent:** Survives page refreshes, browser restarts, multiple tabs
3. **Mandatory Modal:** Returning customers MUST resolve the lock via Leave/Stay decision
4. **Source of Truth:** PayU verification determines when unlock is safe

---

## Technical Implementation

### Database Schema

**New Column: `orders.checkout_locked_at`**

```sql
ALTER TABLE orders ADD COLUMN checkout_locked_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX orders_checkout_locked_idx 
ON orders(user_id, checkout_locked_at) 
WHERE checkout_locked_at IS NOT NULL AND payment_status = 'pending';
```

**Properties:**
- `NULL` = Checkout not locked (normal state)
- `TIMESTAMP` = Checkout locked since this time
- Indexed for fast lookup of user's locked checkouts

### Lock Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│ 1. Customer clicks "Continue to PayU"                    │
│    ↓                                                      │
│ 2. Backend creates PayU attempt                          │
│    ↓                                                      │
│ 3. SET checkout_locked_at = NOW()                        │
│    ↓                                                      │
│ 4. Redirect to PayU (customer leaves VPB)                │
│    ↓                                                      │
│ 5. Customer at PayU payment gateway                      │
│    ↓                                                      │
│ ┌─────────────────┬─────────────────┬─────────────────┐ │
│ │                 │                 │                 │ │
│ │  COMPLETES      │  CANCELS/FAILS  │  RETURNS        │ │
│ │  PAYMENT        │  PAYMENT        │  WITHOUT        │ │
│ │                 │                 │  COMPLETING     │ │
│ │  ↓              │  ↓              │  ↓              │ │
│ │  Webhook →      │  Verification → │  Modal →        │ │
│ │  Paid           │  Failed         │  Leave/Stay     │ │
│ │  ↓              │  ↓              │  ↓              │ │
│ │  CLEAR LOCK     │  CLEAR LOCK     │  IF LEAVE:      │ │
│ │                 │                 │  Verify → Clear │ │
│ │                 │                 │  IF STAY:       │ │
│ │                 │                 │  Keep Locked    │ │
│ └─────────────────┴─────────────────┴─────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### When Lock is Set

**File: `src/lib/payu-payments.ts`**

```typescript
await tx.update(orders).set({ 
  payuTxnId: attempt.txnId,
  paymentMethod: 'payu',
  customerEmail: attempt.email,
  paymentStatus: 'pending',
  checkoutLockedAt: new Date(), // 🔒 LOCK ACTIVATED
  updatedAt: new Date()
}).where(eq(orders.id, order.id));
```

**Trigger:** Immediately before redirecting to PayU

### When Lock is Cleared

**1. Payment Succeeds**

**File: `src/lib/payment-finalization.ts`**

```typescript
await tx.update(orders).set({
  paymentStatus: 'paid',
  orderStatus: 'confirmed',
  checkoutLockedAt: null, // 🔓 LOCK CLEARED
  paidAt: new Date(),
  // ... other fields
}).where(eq(orders.id, order.id));
```

**Trigger:** Payment captured and verified

**2. Payment Fails/Cancelled**

**File: `src/lib/payu-payments.ts`**

```typescript
await tx.update(orders).set({
  paymentStatus: failed ? 'failed' : 'pending',
  checkoutLockedAt: failed ? null : order.checkoutLockedAt, // 🔓 CLEAR if failed
  // ... other fields
}).where(eq(orders.id, order.id));
```

**Trigger:** PayU verification confirms failure/cancellation

**3. Customer Clicks "Leave & Cancel Payment"**

**File: `src/app/api/payment/cancel-session/route.ts`**

```typescript
if (updatedOrder.paymentStatus === 'failed') {
  await db.update(orders)
    .set({ checkoutLockedAt: null, updatedAt: new Date() }) // 🔓 LOCK CLEARED
    .where(eq(orders.id, updatedOrder.id));
  
  return NextResponse.json({
    ok: true,
    status: 'verified_failed',
    message: 'Payment session cancelled successfully.'
  });
}
```

**Trigger:** Verification confirms safe to unlock

---

## Backend API Endpoints

### 1. Check Lock Status

**Endpoint:** `GET /api/payment/check-lock`

**Purpose:** Check if user has an active locked checkout

**Response:**
```typescript
{
  ok: true,
  locked: boolean,
  orderId?: string,
  orderNumber?: string,
  paymentStatus?: string,
  lockedAt?: string,
  hasTxnId?: boolean
}
```

**Used By:**
- Frontend on page load
- Periodic polling (every 5 seconds)
- Before allowing new payment attempts

### 2. Create Payment (with Lock Check)

**Endpoint:** `POST /api/payment/create`

**Lock Enforcement:**
```typescript
// Check for existing locked checkout
const existingLocked = await tx.select()
  .from(orders)
  .where(and(
    eq(orders.userId, me.id),
    inArray(orders.paymentStatus, ['pending', 'failed']),
    isNotNull(orders.checkoutLockedAt)
  ))
  .limit(1);

if (existingLocked.length > 0 && existingLocked[0].checkoutLockedAt) {
  throw new DeliveryError(
    `You have an active payment session for order ${existingLocked[0].orderNumber}. Please complete or cancel that payment before starting a new one.`,
    409
  );
}
```

**Result:** Cannot create new payment while locked

### 3. Cancel Session (with Lock Clear)

**Endpoint:** `POST /api/payment/cancel-session`

**See:** [PayU Session Cancellation Documentation](./payu-session-cancellation.md)

**Lock Behavior:**
- Verifies payment with PayU
- If failed → clears lock
- If paid → clears lock (already cleared by finalization)
- If pending → keeps lock (unsafe to unlock)

---

## Frontend Implementation

### State Management

```typescript
const [checkoutLocked, setCheckoutLocked] = useState(false);
const checkLockInProgress = useRef(false);
```

### Check Lock Function

```typescript
const checkCheckoutLock = async () => {
  if (checkLockInProgress.current) return;
  checkLockInProgress.current = true;
  
  try {
    const response = await apiFetch('/api/payment/check-lock');
    const result = await response.json();
    
    if (result.ok && result.locked) {
      setCheckoutLocked(true);
      setPendingReceipt(result.orderId);
      setPaymentFailed(result.paymentStatus === 'failed');
      
      // Always show modal for locked checkout
      if (!hasShownSessionModal.current) {
        hasShownSessionModal.current = true;
        setShowSessionModal(true);
        setStep(3);
      }
      return true;
    } else {
      setCheckoutLocked(false);
      return false;
    }
  } finally {
    checkLockInProgress.current = false;
  }
};
```

### Periodic Lock Checking

```typescript
useEffect(() => {
  if (!me || loading) return;
  
  // Check on mount
  void checkCheckoutLock();
  
  // Check every 5 seconds while on checkout page
  const interval = setInterval(() => {
    void checkCheckoutLock();
  }, 5000);
  
  return () => clearInterval(interval);
}, [me, loading]);
```

**Why Periodic?**
- Detects locks from other tabs/devices
- Handles browser back navigation
- Catches payment completion in background
- Works even if frontend state gets stale

### Payment Button Lock

```typescript
<button 
  onClick={() => placeOrder()} 
  disabled={placing || checkoutLocked} 
  className="btn-primary disabled:opacity-60"
>
  {checkoutLocked ? 'Payment Session Active' : 'Continue to Payment'}
</button>
```

**Visual Feedback:**
- Button disabled when locked
- Text changes to indicate active session
- User cannot click through to create duplicate

---

## User Experience Scenarios

### Scenario 1: Normal Payment Flow

1. Customer clicks "Continue to PayU"
2. Lock activated, redirected to PayU
3. Customer completes payment
4. Webhook arrives → payment finalized → lock cleared
5. Customer redirected to confirmation → no modal
6. Can start new checkout normally

**Result:** ✅ Smooth, no interruption

### Scenario 2: Customer Presses Back

1. Customer at PayU → presses back button
2. Returns to VPB checkout
3. Frontend detects locked checkout
4. **Modal appears:** "Your payment session is still active"
5. Customer clicks "Stay" → returns to PayU
6. Completes payment → lock cleared

**Result:** ✅ Guided back to complete payment

### Scenario 3: Customer Closes PayU Tab

1. Customer at PayU → closes tab
2. Later returns to VPB in same browser
3. Checkout page loads
4. `checkCheckoutLock()` finds locked order
5. **Modal appears automatically**
6. Customer clicks "Leave" → verification → lock cleared
7. Can retry payment

**Result:** ✅ Forced to resolve before new attempt

### Scenario 4: Multiple Tabs

1. Customer opens VPB in Tab A
2. Starts payment → lock activated
3. Opens VPB in Tab B (same browser)
4. Tab B's periodic check detects lock
5. **Modal appears in Tab B**
6. Tab B's "Continue to Payment" button disabled

**Result:** ✅ Cannot create duplicate from another tab

### Scenario 5: Page Refresh During Payment

1. Customer at PayU
2. Goes back to VPB tab
3. Accidentally refreshes page (Cmd+R / F5)
4. Page reloads, runs `checkCheckoutLock()`
5. Finds locked checkout in database
6. **Modal appears:** "Your payment session is still active"

**Result:** ✅ Lock persists, modal enforced

### Scenario 6: Different Device/Browser

1. Customer starts payment on Phone
2. Switches to Laptop (same account)
3. Goes to checkout on Laptop
4. Laptop's `checkCheckoutLock()` finds Phone's lock
5. **Modal appears on Laptop**
6. Laptop shows "Payment Session Active" on button

**Result:** ✅ Cross-device lock enforcement

### Scenario 7: Payment Succeeds in Background

1. Customer at PayU → closes tab
2. Returns to VPB → modal appears
3. Meanwhile, webhook arrives → payment finalized
4. Customer clicks "Leave"
5. Verification finds payment succeeded!
6. Lock already cleared by finalization
7. Redirected to order confirmation

**Result:** ✅ Discovers completed payment

---

## Edge Cases Handled

### 1. Race Condition: Payment Success vs New Attempt

**Problem:** Customer completes PayU payment, webhook is slow, customer tries starting new payment

**Solution:**
```typescript
// Backend check before creating new payment
const existingLocked = await tx.select()
  .from(orders)
  .where(and(
    eq(orders.userId, me.id),
    isNotNull(orders.checkoutLockedAt)
  ));

if (existingLocked.length > 0) {
  throw new DeliveryError('Active payment session exists');
}
```

**Result:** New payment blocked, customer forced to resolve

### 2. Stale Lock After Crash

**Problem:** Server crashes during payment, lock never cleared

**Solution 1 - Periodic Verification:**
```typescript
// Frontend periodically checks lock status
setInterval(() => checkCheckoutLock(), 5000);
```

**Solution 2 - Forced Verification:**
Customer clicks "Leave" → backend verifies with PayU → clears if safe

**Solution 3 - Admin Tool (future):**
Admin dashboard can manually clear stale locks

### 3. Customer Forgets About Payment

**Problem:** Customer starts payment, leaves for hours, returns

**Solution:**
Lock persists indefinitely until resolved. On return:
1. Modal appears
2. Customer clicks "Leave"
3. Verification finds "failed" or "expired"
4. Lock cleared, retry allowed

**Note:** PayU sessions typically expire after 30 minutes

### 4. Browser LocalStorage Cleared

**Problem:** Customer clears browser data, loses frontend state

**Solution:** Lock is in database, not localStorage. Next page load:
```typescript
await checkCheckoutLock(); // Finds lock from DB
setShowSessionModal(true);  // Shows modal
```

**Result:** Lock enforced regardless of browser data

### 5. Multiple Failed Attempts

**Problem:** Customer tries payment, fails, tries again (3x attempt limit)

**Solution:**
- Each failed attempt clears lock (safe to retry)
- Frontend counts attempts separately
- At 3 attempts: verification required, but lock works independently
- Lock prevents concurrent attempts, attempt counter prevents spam

---

## Security Considerations

### 1. User Isolation

**Check:** Every lock query filters by `userId`

```typescript
.where(and(
  eq(orders.userId, me.id), // 🔒 User can only see their own locks
  isNotNull(orders.checkoutLockedAt)
))
```

**Result:** Users cannot see or unlock others' checkouts

### 2. Authorization on Unlock

**Check:** Cancel-session endpoint verifies ownership

```typescript
const [order] = await tx.select()
  .from(orders)
  .where(and(
    eq(orders.id, orderId),
    eq(orders.userId, me.id) // 🔒 Must own the order
  ))
  .for('update');

if (!order) {
  throw new DeliveryError('Order not found', 404);
}
```

**Result:** Cannot unlock someone else's checkout

### 3. No Client-Side Unlock

Frontend cannot directly set `checkoutLockedAt = null`. Only backend can unlock via:
1. Payment finalization (paid)
2. Verification (failed)
3. Cancel-session (verified safe)

**Result:** Lock cannot be bypassed by tampering

### 4. Database Transaction Safety

All lock operations use database transactions:
```typescript
return await db.transaction(async tx => {
  // Lock check
  // Payment creation
  // Lock activation
  // All atomic
});
```

**Result:** No partial states, no race conditions

---

## Monitoring & Diagnostics

### Key Metrics

1. **Active Locks Count**
```sql
SELECT COUNT(*) FROM orders
WHERE checkout_locked_at IS NOT NULL
AND payment_status IN ('pending', 'failed');
```

2. **Average Lock Duration**
```sql
SELECT AVG(NOW() - checkout_locked_at) as avg_duration
FROM orders
WHERE checkout_locked_at IS NOT NULL
AND payment_status = 'pending';
```

3. **Stale Locks (>1 hour)**
```sql
SELECT id, order_number, checkout_locked_at, payment_status
FROM orders
WHERE checkout_locked_at < NOW() - INTERVAL '1 hour'
AND payment_status = 'pending';
```

4. **Lock Clear Rate**
```sql
-- Locks that were cleared today
SELECT COUNT(*) FROM orders
WHERE checkout_locked_at IS NOT NULL
AND updated_at::date = CURRENT_DATE
AND payment_status IN ('paid', 'failed');
```

### Log Events

```typescript
payuLog('checkout_locked', { orderId, txnid });
payuLog('checkout_unlocked', { orderId, reason: 'paid' | 'failed' | 'cancelled' });
payuLog('checkout_lock_blocked_attempt', { userId, existingOrderId });
```

---

## Testing Checklist

- [ ] Lock activated when redirecting to PayU
- [ ] Modal appears when returning with locked checkout
- [ ] Cannot create new payment while locked
- [ ] Lock cleared on payment success
- [ ] Lock cleared on payment failure
- [ ] Lock persists across page refresh
- [ ] Lock detected in multiple tabs
- [ ] Periodic check finds locks from other devices
- [ ] "Leave" button clears lock after verification
- [ ] "Stay" button keeps lock and returns to PayU
- [ ] Payment button disabled when locked
- [ ] Lock survives browser restart
- [ ] Lock enforced across different browsers (same account)

---

## Deployment

### 1. Run Migration

```bash
psql $DATABASE_URL -f migrations/0011_checkout_lock.sql
```

### 2. Verify Index

```sql
\d orders
-- Should show checkout_locked_at column and index
```

### 3. No Code Changes Needed

Schema updated, code already uses new column.

### 4. Rollback Plan

If issues occur:
```sql
-- Remove lock enforcement (emergency only)
UPDATE orders SET checkout_locked_at = NULL
WHERE payment_status IN ('pending', 'failed');

-- Drop column (after code rollback)
ALTER TABLE orders DROP COLUMN checkout_locked_at;
DROP INDEX IF EXISTS orders_checkout_locked_idx;
```

---

## Future Enhancements

1. **Auto-unlock Stale Locks**
   - Cron job to clear locks older than 2 hours with pending status
   - Requires payment verification before unlocking

2. **Admin Lock Management**
   - Dashboard to view all locked checkouts
   - Manual unlock capability for support
   - Lock history and analytics

3. **Customer Notification**
   - Email/SMS when payment session is locked
   - Reminder after 30 minutes to complete or cancel
   - Link to directly resolve lock

4. **Lock Duration Tracking**
   - Track how long customers take to resolve locks
   - Identify UX issues (confused customers)
   - Optimize modal messaging

---

## Conclusion

The Checkout Lock Mechanism provides **strict, persistent, backend-enforced** prevention of duplicate payments. Combined with the Leave/Stay modal, it ensures customers always resolve their PayU sessions before starting new payments.

**Key Benefits:**
- ✅ Prevents duplicate payments
- ✅ Works across tabs, devices, browser sessions
- ✅ Survives page refreshes and crashes
- ✅ Forces explicit customer decision (Leave/Stay)
- ✅ Backend-enforced (cannot be bypassed)
- ✅ Integrates with existing payment flow

**No Breaking Changes:** Existing payment flow unchanged for customers without active sessions.
