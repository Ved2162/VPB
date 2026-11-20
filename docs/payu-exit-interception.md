# PayU Payment Page Exit Interception

## Technical Assessment

This document explains what is technically possible for intercepting customer
exit from PayU's hosted checkout page, what VPB has implemented, and what
cannot be implemented — with the reason why.

---

## The Core Constraint: Cross-Origin Isolation

PayU's hosted checkout page is served from a different origin:

| Environment | URL |
|---|---|
| Test        | `https://test.payu.in/_payment` |
| Production  | `https://secure.payu.in/_payment` |

VPB's checkout page is served from your own domain (e.g., `https://vpb.in`).

**These are different origins.** The browser's Same-Origin Policy means:

- VPB's JavaScript cannot access the DOM of the PayU page.
- VPB cannot add a `beforeunload` or `popstate` event listener to the PayU page.
- VPB cannot intercept the Back button while the customer is on PayU's page.
- VPB cannot inject a confirmation dialog into PayU's page.

This is not a limitation of VPB's implementation — it is a fundamental browser
security guarantee that cannot be worked around without modifying PayU's code.

**Any implementation claiming to show a confirmation popup inside PayU's page
from VPB's JavaScript would be fraudulent.**

---

## What PayU's Hosted Checkout Actually Provides

PayU's hosted checkout integration exposes exactly three merchant-controlled
URLs, all passed as form fields:

| Field | Purpose | When called |
|---|---|---|
| `surl` | Success URL | Customer completes payment |
| `furl` | Failure URL | Payment fails (declined, timeout, etc.) |
| `curl` | Cancel URL | Customer clicks Cancel/Back **on PayU's page** |

When a customer clicks PayU's own Cancel button (or the back arrow PayU
renders in its UI), PayU POSTs to `curl` with these fields:

```
status         = "failure"
unmappedstatus = "usercancelled"
txnid          = <original transaction ID>
amount         = <original amount>
hash           = <SHA-512 response hash>
... (all standard response fields)
```

**PayU does not call `curl` for:**
- Browser Back button (bypasses PayU's page entirely)
- Closing the browser tab
- Phone call interrupting the session
- Network timeout
- Customer directly typing a new URL

For those cases, the customer simply disappears from PayU's perspective until
either the transaction times out or the customer returns to VPB.

---

## What VPB Has Implemented

### 1. Dedicated `curl` Endpoint

**File:** `src/app/api/payment/payu/cancel/route.ts`  
**URL:** `/api/payment/payu/cancel`

Previously, `surl`, `furl`, and `curl` all pointed to the same return handler.
Now `curl` has its own endpoint that:

1. Validates the PayU hash (same security as the return endpoint).
2. Calls `reconcilePayu()` to verify the transaction status with PayU's
   verification API — a `usercancelled` callback is not taken at face value.
3. Redirects to `/checkout?paymentOrder=<id>&cancelled=true`.

The `cancelled=true` query parameter signals the checkout page that the
customer arrived from PayU's own cancel action, not from an unresolved exit.

### 2. `cancelled=true` Modal on VPB Checkout

**File:** `src/app/checkout/page.tsx`

When the checkout page loads with `?cancelled=true`, it:

1. Does **not** start automatic verification polling (which would show a
   confusing "pending" error on a session the customer just cancelled).
2. Shows the Leave/Stay modal immediately with copy matching the spec:
   - **Title:** "Are you sure you want to leave payment?"
   - **Body:** "Your payment is currently in progress. Leaving this page will
     request cancellation of your payment session."
   - **Buttons:** "Stay on Page" / "Leave Page"
3. Clears `cancelled=true` from the URL after reading it, so a page refresh
   does not retrigger the modal.

### 3. Leave / Stay Behaviour

**Stay on Page:**
- Closes the modal.
- Calls `placeOrder(pendingReceipt)` which calls `/api/payment/retry`.
- The retry endpoint verifies the previous attempt status and either reopens
  PayU or confirms the payment is already resolved.

**Leave Page:**
- Calls `POST /api/payment/cancel-session` with the order ID.
- The backend verifies the transaction status with PayU.
- If PayU confirms failure/cancellation → marks order failed, clears checkout
  lock, enables retry.
- If PayU confirms success → finalizes the order, redirects to confirmation.
- If PayU shows still pending → keeps the checkout locked, shows pending message.

### 4. Checkout Lock for Back-Button / Tab-Close Returns

**File:** `src/db/schema.ts`, `src/lib/payu-payments.ts`

For the cases where `curl` is never called (browser Back, tab close, etc.),
the existing checkout lock mechanism handles recovery:

- When the customer is redirected to PayU, `checkoutLockedAt` is set on the
  order row.
- If they return to VPB checkout by any means, `GET /api/payment/check-lock`
  detects the lock and shows the same Leave/Stay modal.
- The periodic check (every 5s while on the checkout page) ensures the modal
  appears even if the customer navigates back via browser history.

---

## What Cannot Be Implemented

### Browser Back Button on PayU's Page

**Request:** Show a confirmation popup when the customer presses the browser
Back button while on `secure.payu.in/_payment`.

**Why it cannot be done:**

The Back button, when pressed on a cross-origin page, navigates the browser
away from that page entirely. No JavaScript event on `secure.payu.in` is
accessible to VPB code. The `beforeunload` event fires on PayU's page, not
VPB's — and even if PayU used `beforeunload` on their own page, the browser's
modern policy ([Chrome 2019+, Firefox 2017+](https://caniuse.com/beforeunload))
only shows the browser's native "Leave site?" dialog, not a custom merchant UI.

The only way a merchant can intercept Back on PayU's page would be if PayU
embedded its checkout in an `<iframe>` on the merchant's domain. PayU does
not support this for the standard hosted checkout integration.

### Custom Dialog Inside PayU's UI

**Request:** A custom popup matching VPB's cream/maroon design on PayU's page.

**Why it cannot be done:**

PayU's hosted checkout page renders its own UI. VPB cannot inject HTML or
JavaScript into it. Any such feature would need to be built by PayU and
offered as a merchant configuration option — it does not exist.

### Automatic Redirect After Back-Button Exit

**Request:** When the customer presses Back and returns to VPB, have VPB
"automatically redirect them to the VPB website" after cancellation.

**Actual behaviour:**

Pressing Back already takes the customer to the previous page in their
browser history — which is typically the VPB checkout page. VPB then detects
the unresolved lock and shows the Leave/Stay modal. This is the correct UX.
There is no additional redirect to implement.

---

## Flow Diagrams

### Path 1: Customer uses PayU's Cancel button

```
Customer at PayU page
        │
        ▼
  Clicks "Cancel" or back arrow on PayU's page
        │
        ▼
  PayU POSTs to curl (/api/payment/payu/cancel)
        │  hash validated, reconciled with verify_payment API
        ▼
  303 redirect to /checkout?paymentOrder=<id>&cancelled=true
        │
        ▼
  VPB checkout page loads
        │  reads cancelled=true, clears it from URL
        ▼
  Modal: "Are you sure you want to leave payment?"
  [Stay on Page]  [Leave Page]
        │
  ┌─────┴──────┐
  ▼            ▼
Stay          Leave
  │            │
  │            ▼
  │     POST /api/payment/cancel-session
  │            │
  │       Verify with PayU
  │            │
  │    ┌───────┼───────────────┐
  │    ▼       ▼               ▼
  │  paid    failed          pending
  │    │       │               │
  │    ▼       ▼               ▼
  │  Order   Lock          Keep lock
  │  confirmed cleared      show msg
  │    │       │
  │    ▼       ▼
  │  Success  Retry
  │  page     enabled
  ▼
Reopen same PayU session
(no new txn created)
```

### Path 2: Customer presses browser Back / closes tab

```
Customer at PayU page (secure.payu.in)
        │
        ▼
  Browser Back / closes tab / switches away
  [PayU is not notified — curl not called]
        │
        ▼
  Customer returns to VPB checkout page
        │
  Periodic lock check (every 5s) OR
  page load with ?paymentOrder param
        │
        ▼
  GET /api/payment/check-lock → locked=true
        │
        ▼
  Modal: "Your payment session is still active"
  [Stay & Complete Payment]  [Leave & Cancel Payment]
        │                           │
        ▼                           ▼
  Reopen PayU              POST /api/payment/cancel-session
                                    │
                              [same verification flow as Path 1]
```

---

## Security Properties

- The `curl` endpoint validates the same SHA-512 hash as `surl`/`furl`.
  A spoofed GET or POST without a valid hash is rejected.
- VPB never marks a transaction failed solely because `curl` was called.
  The PayU verification API is always consulted.
- The checkout lock is a database row — it cannot be bypassed by clearing
  browser storage or opening a new tab.
- The Leave action calls the authenticated backend; the frontend cannot
  directly modify payment or order status.

---

## Configuration Change

The only configuration change is that `curl` now points to the new endpoint
instead of the shared return handler:

```
Before: curl = /api/payment/payu/return  (same as surl and furl)
After:  curl = /api/payment/payu/cancel  (dedicated cancel handler)
```

This change takes effect immediately on the next deployment. No environment
variable changes are required.
