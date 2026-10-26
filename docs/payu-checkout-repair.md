# PayU checkout repair — 26 October 2026

## Live cutover recovery — 27 October 2026

Live credentials and Production mode remain unchanged. After the merchant confirmed sandbox end-to-end success and requested Live activation, a restored browser receipt caused `Payment environment mismatch`. Vercel's production logs identified transaction `c6f01c9862f4cd772b25b178`, belonging to the failed Rs 2750 sandbox order `VPB-202610-161353`; the visible cart had meanwhile changed to Rs 1. Read-only database inspection found no Rs 1 order. The frontend was checking the older receipt instead of initiating the current cart.

Owned-order verification, retry and replayed creation now return an explicit recovery code only for a stored TEST attempt when the current gateway is Production. The browser removes that old receipt/request context and restores the current cart's payment action without clearing the cart or automatically charging. Fresh Live creation excludes matching retired test orders from deduplication, preserves their history, and releases only their matching temporary stock reservations under locks so the last unit can be reserved by the new Live order. New Live attempts still deduplicate under the existing user/order locks. Pending Live payments and same-environment merchant-key mismatches cannot use this recovery path.

Validation: 166 backend tests passed, including preservation of pending/failed/paid test records, last-unit stock recovery, concurrent Live creation and blocked mismatched Live payments. All 14 browser regressions passed, including restored test receipts, stale request IDs and preservation of uncertain Live attempts. The production build passed. No real-money transaction or manual production database change was performed for this repair. After deployment, refresh the checkout once to load the recovery code, then continue to PayU.

## Original investigation

Subsequent merchant-authorized testing switched the public Vercel target to PayU Test Mode and identified the real sandbox redirect host. See [sandbox validation](payu-sandbox-validation.md) for the current deployed mode, actual sandbox results and remaining Live checks. The original incident analysis below describes the investigation before that switch.

Implemented and tested locally. **Deployment and fresh authoritative PayU reconciliation remain outstanding.** The user subsequently supplied order VPB-202610-703439 and www.vpbbarelimacker.com. Read-only queries against the configured database located the order and related attempts, and public HTTP headers confirmed the old CSP remains deployed. No Live PayU credentials, merchant dashboard session or screenshot transaction ID were available. No production configuration, database records, charges or refunds were changed.

## Verified findings and limits

The existing integration is classic PayU India Hosted Checkout, not the v2 API. The checkout calls `/api/payment/create`, which authenticates the customer, locks their account, calculates prices from the database, reserves stock, creates/reuses an order and stores an immutable payment attempt. The response contains `action` and signed `fields`; it does not contain a checkout URL. The browser POSTs those fields to `_payment` in the same tab. Request hash ordering, production collection/verification URLs and callback reverse hashes match the official protocol.

A reproducible navigation defect exists in `next.config.ts`: the previous `form-action` policy allowed `secure.payu.in` but excluded `api.payu.in`. In a Chromium test where the initial hosted POST receives an HTTP redirect to `api.payu.in`, the POST reaches the first host but the browser blocks subsequent navigation. The original policy failed the regression; the updated policy passes. A separate regression reinstates the old policy and checks that a CSP violation follows the initial POST and the destination is never reached. Chromium reports the original form URL in that violation. These are local transport doubles, not evidence that this merchant's actual Live transaction received that redirect. PayU documents API-host navigation in its payment integrations, but the actual Live HTTP redirect chain is still needed to attribute the incident conclusively.

The browser previously removed the form immediately after calling `submit`, stopped showing its loading state immediately, and did not detect failed navigation. It saved the pending order before departure. On subsequent visits, the frontend only verified that order. Once verification returned pending, `preparePayuCheckout` and `/api/payment/retry` correctly refused a replacement attempt, but the UI incorrectly claimed a PayU tab was open and offered no automatic recovery checks. An `initiated` state does not prove a customer can still see the provider page. PayU's `in progress` state must not be treated as failure or expired by age alone.

## Changes

| File | Reason |
| --- | --- |
| `next.config.ts` | Permit the exact HTTPS API host for hosted redirects; retain the other CSP restrictions. |
| `src/lib/payu-navigation.ts` | Validate initial destination and field format, retain the POST form until departure, detect enforced CSP failures and a 12-second stalled navigation, and cancel the browser load on failure. A browser timeout never changes payment status. |
| `src/app/checkout/page.tsx` | Hold loading through navigation, guard concurrent actions synchronously, show useful recovery errors, restore the owned order, and poll at 5/10/15/20/25-second delays (at most five automatic checks). Pause automatic checks on verification errors; manual checks remain available. Display the server-priced summary after creation. |
| `src/lib/payu-payments.ts` | Return the authoritative order summary, log preparation/reconciliation/retry decisions and reject current-order amount mismatches for non-success results too. Existing captured-payment finalization already checks order amounts under lock. |
| `src/lib/payu.ts` | Log Verify Payment HTTP results and sanitized unavailable/not-confirmed outcomes. |
| `src/lib/payu-log.ts` | Restrict diagnostic metadata to references, statuses, amounts and codes; never log request/response bodies, credentials, hash fields or customer data. The attempt's primary key is the merchant transaction ID. |
| `src/app/api/payment/create/route.ts` | Log sanitized initiation errors. |
| `src/app/api/payment/retry/route.ts` | Log blocked retries and sanitized retry errors. |
| `src/app/api/payment/payu/verify/route.ts` | Explicitly disable caching of owned-order verification results. |
| `tests/payu.test.ts` | Test concurrent retries after bounced/dropped outcomes, invalid configuration, exact Live endpoints, and the 1800/1550 mismatch. |
| `tests/e2e/payu.spec.ts` | Test hosted redirects under real response headers, old-policy rejection, blocked navigation, repeated status clicks, initiation rejection and bounded polling, alongside existing return/recovery tests. Provider requests are intercepted or aborted. |
| `.payu-checkout.playwright.config.ts` | Optional runner for a separately started fresh disposable server when Windows test-server teardown hangs; inherits the normal Playwright settings. |
| `docs/payu-migration.md`, `docs/payu-checkout-repair.md` | Update policy documentation and record evidence, operational recovery and validation limits. |

No migration is needed. The existing `pending`/`failed`/`paid` attempt states remain. Initiation is the locked preparation phase; provider `initiated`, `in progress`, `pending` and `auth` remain internal pending. Only verified `success` + `captured` becomes paid. Verified `failure`/`failed` paired with `failed`, `usercancelled`, `bounced` or `dropped` permits a new transaction on the same order. No unsupported expiration/cancellation API or fabricated provider resume URL is introduced. Pending, unknown, Not Found and transport failures do not authorize a new charge. Existing terminal-state and uniqueness protections preserve history and make callbacks idempotent.

## Amount discrepancy

Read-only reconciliation found two separate orders for the same customer on the incident date:

| Order | Order total | Stored attempt amount | Merchant transaction ID | Stored state |
| --- | --- | --- | --- | --- |
| VPB-202610-703439 | Rs 1800 | Rs 1800 | b980a7ef4d21a14692d5236e | pending; last stored verification pending/initiated |
| VPB-202610-218278 | Rs 1550 | Rs 1550 | 8f8879d302be318c4d77dd83 | pending |

The supplied Rs 1800 order has one stored attempt in production and no recorded PayU payment ID. Its subtotal is Rs 1800, discount zero and shipping zero. This rules out a stored Rs 1550 attempt being attached to that order. The separate Rs 1550 order is a concrete candidate for the dashboard screenshot, but its dashboard merchant transaction ID must be compared before concluding it is the same transaction. No local Live PayU credentials were available to obtain fresh provider status. Database status is last recorded evidence, not a current authoritative provider result.

The server ignores client totals, reads product prices, applies the existing Rs 200 discount at subtotal >= Rs 6000 and zero shipping, and records no separate tax. Attempt amount is stored in paise and signed into the request. Verification checks transaction ID, order reference, product, amount and any reported currency. Finalization checks the original order amount under lock. INR-only account configuration remains required because this PayU API may omit currency in its result.

The new regression creates an order priced at Rs 1800, verifies its request is `1800.00`, supplies a matching-reference PayU capture for `1550.00`, and asserts rejection with the original order still pending at Rs 1800. This protects the discrepancy; it does not explain the two production screenshots.

For authorized read-only production reconciliation, bind the actual order number and merchant transaction ID as `$1` and `$2`:

```sql
SELECT o.id, o.order_number, o.total * 100 AS order_amount_paise,
       o.payment_status, o.payu_txn_id AS current_txnid,
       a.txn_id, a.amount AS attempt_amount_paise, a.status AS attempt_status,
       a.payment_id, a.environment, a.created_at, a.verified_at
FROM orders o
JOIN payu_attempts a ON a.order_id = o.id
WHERE o.order_number = $1 OR a.txn_id = $2
ORDER BY o.id, a.created_at;
```

Match the merchant transaction ID (not merely PayU's payment ID) and order reference against the dashboard and authenticated Verify Payment result. Preserve all attempts. If the 1550 transaction belongs to a different order, document that association rather than changing either amount.

## Existing In Progress recovery and deployment

1. Open **My Orders → Check payment / retry** for the original order, or `/checkout?paymentOrder=<internal-order-UUID>`. Check status using its stored transaction. This calls authoritative Verify Payment without initiating a charge.
2. If PayU confirms a captured payment, reconciliation completes that order idempotently. If it confirms terminal failure/cancellation/bounce/drop, use **Retry payment**; the backend verifies again and issues one new ID under locks.
3. If a PayU page is still open, complete or cancel there. If it is closed and the provider stays pending/Not Found, give PayU merchant support the order/transaction references for authoritative reconciliation. Never mark it failed, delete the attempt, resubmit a provider-pending ID, or replace it based on elapsed time. This integration has no documented safe resume/cancel operation for an already registered pending checkout.
4. Keep `PAYU_ENV=production`, `PAYU_ENABLED=true`, `PAYU_CURRENCY=INR`, the existing matching Live `PAYU_MERCHANT_KEY`/`PAYU_MERCHANT_SALT`, and `PAYU_BASE_URL` set to the canonical HTTPS site origin. No new environment variable is required. No environment setting was changed here. Deploy/rebuild to apply the header change; check for any extra restrictive CSP from a proxy or hosting dashboard.
5. Confirm public POST callback reachability at `/api/payment/payu/return` and payment webhook delivery to `/api/payment/payu/webhook` in the correct merchant account. Both validate signatures and authoritative details. Browser redirects alone never authorize payment.
6. A public HEAD request to https://www.vpbbarelimacker.com/checkout returned a login redirect and the old policy on both responses: form-action self, test.payu.in and secure.payu.in, without api.payu.in. The local fix is not yet deployed. Before declaring the Live incident resolved, inspect the actual authenticated Live navigation chain and logs, correlate the screenshot transaction reference, and validate a merchant-authorized end-to-end Live checkout/return. Real-money payment was deliberately not used for local tests.

## Validation

The final full backend suite passed **161 tests across 16 files**. The focused payment/migration suite also passed 42 tests. Production build including TypeScript passed after all source changes. ESLint reported zero errors and four existing image-element warnings. Secret scanning reported zero current findings and ten historical retired seed-password locations (pre-existing).

Browser scenarios cover hosted POST/verified return, API-host redirection, old CSP rejection, blocked navigation, double status clicks, initiation errors, bounded polling, missing-email persistence, refresh, delayed capture, cancelled-payment retry and status outages. All browser provider traffic is mocked or aborted, and all backend tests use disposable PGlite databases; production was not switched to sandbox.

Final browser result: **10 passed in 28.0 seconds, exit code 0**, using a fresh disposable server and the optional runner configuration. The old-policy diagnostic checks the original form URL reported by Chromium, confirms the initial POST occurred and confirms the API-host checkout was blocked. The corresponding new-policy test reaches that checkout. The final build passed after all source changes. Earlier test-server teardown, diagnostic assertion, fixture login-budget and temporary Windows process-launch issues were resolved for this final run.

The final TypeScript check, targeted ESLint and git diff --check passed after the route logging changes. Production Live acceptance, the screenshot transaction association and fresh reconciliation of the existing pending transaction remain outstanding. This is not yet a verified Live end-to-end repair.

Official references checked: [Hosted Checkout](https://docs.payu.in/reference/_payment_payu_hosted_checkout), [hashing](https://docs.payu.in/docs/hashing-request-and-response), [Verify Payment](https://docs.payu.in/reference/verify_payment_api), [payment states](https://docs.payu.in/reference/payment-state-explanations), and [duplicate transaction errors](https://docs.payu.in/docs/error-handling). PayU documents API-host navigation in its [UPI TPV integration](https://docs.payu.in/docs/upi-intent-and-collect-autopay-tpv-integration); that example alone does not establish this merchant's actual classic hosted redirect chain.
