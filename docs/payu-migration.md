# PayU migration review and cutover

Status: **TESTING BLOCKED** for actual PayU sandbox transactions. Local implementation is prepared; see the validation report at the end. The merchant confirmed PayU India Hosted Checkout with key and salt on 26 October 2026. No PayU credentials were available locally. Local implementation and validation did not perform live database migrations, credential changes, charges or refunds. The merchant subsequently authorized publishing the code to GitHub for Vercel testing. The dedicated branch is `codex/payu-sandbox`, with Preview builds enabled. Production cutover remains a separate approval.

## Existing architecture and compatibility

This is Next.js 16.4.3 App Router / React 19, with Node route handlers, Drizzle and PostgreSQL (`pg`). Vercel configuration enables automatic deployment for `main` and the dedicated `codex/payu-sandbox` Preview branch, while disabling other branches. Authentication uses signed JWTs in HttpOnly cookies, OTP customer authentication, active-account/session-version checks, and admin/delivery authorization. The actual production database was not queried for this migration.

Previously `/api/payment/create` repriced products and reserved stock before creating a Razorpay order. The browser opened the Razorpay SDK; `/api/payment/verify` checked the receipt signature and fetched captured state. `/api/payment/webhook` processed signed captures, failures and refunds. Shared `finalizePayment` serialized payment processing, stock allocation, order items and a unique notification outbox row. Invoice issuance and MSG91 delivery followed that durable verified state. The browser failure route could release a legacy reservation without provider verification; the new PayU flow never uses it.

The new checkout uses PayU exclusively. Historical Razorpay columns, payment metadata, invoices and order access remain intact. Following the merchant's explicit request to retire Razorpay completely, its SDK dependency, server helper and refund processor are removed. The old `/api/payment/verify`, `/api/payment/failed` and `/api/payment/webhook` endpoints now return HTTP 410 without changing records. The global browser loader and its module were removed. Existing unsettled Razorpay checkouts cannot automatically become PayU transactions; reconcile them first. Migration `0011_payu_only_default.sql` changes only the default for new rows to `payu`; historical provider labels are not rewritten. Previously paid historical stock holds can still be reconciled by an authorized admin using recorded payment evidence, without contacting the retired gateway. New historical captures are rejected.

## Payment protocol

Checkout opens PayU directly when the customer selects **Continue to Payment** on the order summary. There is no email or payment-method form in Step 4. PayU requires a real email: checkout reuses the customer's valid profile or previous-order email, or collects and saves it once with delivery details. Editing an email does not advance the delivery step until the customer saves it. After PayU returns, server verification still controls order confirmation, invoices and notifications.

The selected integration is classic PayU India Hosted Checkout (`_payment`), using SHA-512 and merchant key/salt. It is separate from PayU v2, Web Checkout Pro, split payments and multicurrency flows. Production account activation and method availability still need confirmation. The implementation follows [Hosted Checkout](https://docs.payu.in/reference/_payment_payu_hosted_checkout), [hashing](https://docs.payu.in/docs/hashing-request-and-response), [Verify Payment](https://docs.payu.in/reference/verify_payment_api) and [payment states](https://docs.payu.in/reference/payment-state-explanations).

1. The authenticated create route validates quantities and address, reads eligible product prices, and preserves current pricing: free shipping, a Rs 200 discount at subtotal >= Rs 6000, and no separately recorded tax. Client totals are ignored. A real customer payment email is required; it is never fabricated.
2. A browser-generated checkout UUID persists across network retries. Database uniqueness and user locks prevent replay after payment from creating a new order; equivalent requests from another tab retain their request-ID aliases in private order metadata. User/order locks also deduplicate equivalent pending carts. An immutable 24-character random merchant transaction ID, amount in paise, account environment, merchant key, customer name/email and order association are stored in `payu_attempts`.
3. The browser submits a standard HTML form to the fixed PayU test or production endpoint. The salt never leaves the server. The original checkout steps, cart, address flow and branding remain. The final method is selected on PayU's hosted page; enabled methods depend on the merchant account.
4. Both browser return and payment webhook validate the documented reverse hash in constant time, bind signed fields to the stored attempt, and query PayU's server API. Only matching `success` + `captured` can finalize payment. Authorization, pending, failed, unknown or unavailable verification never creates a paid order. The fixed integration is INR only; any reported conflicting currency is rejected. This API does not always return a currency field, so account-side INR configuration is an essential release check.
5. Duplicate callbacks and replays use the same locked finalizer. Payment IDs are unique across attempts and orders. Stock, order items, invoices and the notification outbox are not duplicated. Late failures cannot overwrite paid/refunded state or fail a newer pending attempt. Late capture with unavailable stock is recorded as paid on review hold, preserving other reservations.
6. Retry checks the old attempt through PayU before allowing a new one. Only an authoritative terminal failure permits a new transaction ID, on the same internal order; every old attempt survives. Verified pending attempts return status recovery instead of another checkout form; PayU rejects duplicate transaction IDs for new checkout submissions. Unknown/not-found/timeouts remain pending and need later verification or support reconciliation. Never bypass this by deleting the old attempt.
7. Browser return uses HTTP 303 to an authenticated checkout result. The result page checks the owned order again; URL parameters are never payment evidence. Session storage and My Orders provide recovery when the customer closes checkout or callbacks are delayed. A valid return during a verification outage still goes to that pending result; webhooks return errors so delivery can be retried. Notification failure cannot reverse payment.

Nonzero additional charges and split responses are rejected for manual review. Do not enable merchant-side surcharges, offers that change the merchant amount, split settlement or multicurrency without separately implementing and testing them. PayU refund/dispute webhooks have a different contract and are not implemented here; do not subscribe them to the payment endpoint. Historical Razorpay refund ledgers are preserved; automatic Razorpay refund-event processing is retired. Outstanding historical provider operations need merchant-dashboard reconciliation. PayU refunds must be handled and reconciled through an approved operational process before offering them automatically.

## Configuration

All variables are server-side; none use `NEXT_PUBLIC_`. Keep distinct databases and credentials for development, staging and production.

| Variable | Required value or purpose |
| --- | --- |
| `PAYU_ENABLED` | `false` by default; `true` enables new checkout only after approval |
| `PAYU_ENV` | Explicit `test` or `production`; no silent fallback |
| `PAYU_CURRENCY` | `INR`; requires an INR merchant account |
| `PAYU_MERCHANT_KEY` | Key for that environment |
| `PAYU_MERCHANT_SALT` | Matching secret salt, backend only |
| `PAYU_BASE_URL` | Canonical application origin, no path/query; HTTPS required except test localhost |

Test collection: `https://test.payu.in/_payment`. Production collection: `https://secure.payu.in/_payment`. Verification uses `https://test.payu.in/merchant/postservice?form=2` or `https://info.payu.in/merchant/postservice.php?form=2`, respectively. Arbitrary provider endpoint overrides are not supported. CSP permits form posts only to self and these two checkout hosts.

No `RAZORPAY_*` variables are used by the application after retirement. The local template and local gateway settings no longer include them. Merchant-dashboard credentials and historical database records are not deleted by this change. Keep JWT, SMS, invoice and MSG91 configuration as before. Disabling new PayU checkout does not disable verification of outstanding PayU attempts.

## Merchant dashboard and URLs

For the approved public application origin `<origin>`:

| Purpose | URL |
| --- | --- |
| Success `surl` | `<origin>/api/payment/payu/return` |
| Failure `furl` and cancellation `curl` | `<origin>/api/payment/payu/return` |
| Successful/Failed payment notifications | `<origin>/api/payment/payu/webhook` |
| Authenticated customer reconciliation | POST `<origin>/api/payment/payu/verify` with internal `orderId` |
| Secret-free configuration/schema readiness | GET `<origin>/api/payment/payu/status` |
| Customer result/recovery | `<origin>/checkout?paymentOrder=<internal-order-uuid>` |
| Retired gateway endpoints (HTTP 410) | `<origin>/api/payment/{verify,failed,webhook}` |

The documented `surl`, `furl` and `curl` values are all sent with the server-generated checkout fields. Cancellation uses the same return endpoint. A GET return only navigates to checkout and never changes payment state. Configure payment Successful and Failed notifications for the PayU webhook URL in the appropriate merchant environment, following [PayU's webhook documentation](https://docs.payu.in/docs/webhook-events-and-sample-payloads). Validate actual form-urlencoded payloads, reverse hashes, retries and public HTTPS reachability. Dashboard settings and deliveries have **not** been configured or verified by this work. Only exact PayU return/webhook paths bypass same-origin protection; ordinary mutations remain protected.

## Database deployment and rollback

`0010_payu.sql` only adds nullable unique `orders.checkout_key`, `orders.payu_txn_id`, `orders.payu_payment_id`, and the attempt table with foreign key, unique payment reference and positive-amount/environment/status constraints. It does not rewrite historical records, issue historical invoices or enqueue historical notifications. Runtime roles that already hold UPDATE on orders receive SELECT/INSERT/UPDATE on attempts; DELETE is not granted. Verify the actual runtime role's access in staging. The migration runner includes `0010` and the non-destructive `0011` default change; test/browser harnesses apply it to disposable PGlite databases. Do not run schema push or production migration as a shortcut.

Apply through the existing reviewed migration runner using the migration-owner connection, after backup and explicit approval. Test rollback is transactional if migration execution fails. For application rollback, disable new checkout and retain the additive schema, all attempts, and verification/callback handlers until reconciliation finishes. Do not drop columns/tables or delete paid/failed attempts. Restoring older code that cannot process PayU callbacks is unsafe while attempts remain outstanding; prefer a forward fix or compatibility deployment. Any eventual schema removal requires a separate approved, audited migration after export and reconciliation.

## Changed files

| Files | Purpose |
| --- | --- |
| `src/lib/payu.ts` | Fixed endpoint/config validation, decimal conversion, hashes and Verify Payment transport |
| `src/lib/payu-payments.ts`, `payu-callback.ts` | Persistent attempts, callback binding, authoritative reconciliation and safe retry |
| `src/app/api/payment/create/route.ts`, `retry/route.ts` | Trusted pricing, request idempotency and PayU preparation |
| `src/app/api/payment/payu/{return,webhook,verify}/route.ts` | Return navigation, signed webhook and owned-order recovery |
| `src/db/schema.ts`, `migrations/0010_payu.sql`, `scripts/migrate.mjs` | Additive schema and reviewed migration registration |
| `src/lib/payment-finalization.ts` | Reuse locked fulfillment for either provider, with separate PayU identifiers |
| `src/lib/invoices.ts`, `order-notifications.ts`, `msg91.ts` | Accept verified payments from either provider; preserve delivery semantics |
| `src/app/api/orders/{route.ts,[id]/route.ts}`, `api/delivery/shipments/[id]/route.ts` | Preserve admin/delivery payment and fulfillment restrictions for PayU |
| `src/app/{checkout,account,admin,contact}/page.tsx` | Hosted form, recovery, provider references and payment copy |
| `src/app/layout.tsx`, deleted `src/lib/razorpay-client.tsx` | Remove active global Razorpay browser SDK |
| `vercel.json` | Enable Preview builds for the approved sandbox branch |
| `src/proxy.ts`, `next.config.ts` | Exact callback exemptions and PayU form-action allowlist |
| `.env.example`, `README.md`, `docs/{security,whatsapp,invoices,payu-migration}.md` | Configuration, historical compatibility and controlled rollout instructions |
| `tests/database.ts`, `scripts/e2e-server.mjs` | Apply migration only to disposable test databases; disable real credentials |
| `tests/payu*.ts`, `tests/e2e/payu.spec.ts` | Protocol/security/state/migration and browser tests with local transport doubles |
| `scripts/scan-secrets.mjs` | Extend secret detection to PayU salt, with existing isolated-fixture rules |
| Existing security, WhatsApp and browser payment tests | Update checkout fixtures while retaining historical Razorpay tests |

## Release checklist and sandbox blockers

1. Review the local diff. Explicit approval is required before commit/push. A push to `main` may automatically deploy on Vercel; review-branch pushes and production deployment require distinct decisions.
2. Provision test key/salt through a private environment configuration, an isolated staging database, and a public HTTPS origin. No secrets should be pasted into source or chat. Confirm UPI/card methods, INR, classic hash version and automatic capture in the actual merchant account.
3. Apply the additive migration to staging with authorization, check restricted-role access, and enable checkout only in staging. Configure and observe webhook delivery.
4. Use [PayU's current sandbox procedures](https://docs.payu.in/docs/test-cards-upi-id-and-wallets) for success, failure and cancellation. Also exercise pending/delayed payments, duplicate/replayed notifications, browser close/back/refresh, repeated submit, tampering and verification outages. Compare API results with the PayU dashboard and stored order/attempt amounts.
5. Check invoice PDFs and historical Razorpay orders. For MSG91, verify queue behavior first; real WhatsApp sends are separate, potentially billable actions and need authorization. Do not infer actual delivery from local transport tests.
6. Verify production account activation, canonical HTTPS callback URLs, capture behavior, supported methods, restricted DB permissions, backups, secrets and monitoring. Review unresolved attempts and a reconciliation/support procedure.
7. Obtain explicit approval before live credentials, enabling production checkout, migration, deployment, or any controlled real payment. Then monitor captures, held stock, pending attempts, invoice failures and notification backlog.

## Validation evidence

Before changes: `npm test` passed **115 tests in 13 files**; `npm run build` passed. Initial Git status contained only an untracked `AGENTS.md`, which was preserved.

Final local checks on 26 October 2026:

| Check | Result |
| --- | --- |
| Full Vitest regression suite | 140 passed across 15 files |
| Final payment/security rerun after request-alias change | 60 passed across 3 files |
| Production build | Passed (Next.js 16.4.3) |
| TypeScript `tsc --noEmit` | Passed |
| ESLint | Zero errors; four existing image-element warnings in unchanged image components |
| Browser regression suite | 25 passed, including three new hosted-form/pending/cancellation tests |
| Secret scan (worktree, browser assets, Git history) | Zero current secret findings; 10 existing historical default-password warnings |
| Diff whitespace check | Passed |

Security cases exercised include trusted totals, altered amount/transaction/order/currency/hash/payment reference, invalid hash length, duplicate and concurrent callbacks, replay after capture, repeated concurrent checkout, request-ID replay from multiple tabs, service timeout/outage, unknown transactions, pending/auth states, terminal failure/cancellation, retry ownership, protected payment/admin edits, unique payment IDs, delayed failures, inventory holds, invoice/outbox uniqueness and notification-failure isolation. The additive migration preserves historical Razorpay fields and verifies runtime-role privileges. Existing tests cover preservation of historical refund ledgers and invoices, authentication/OTP, reviews, admin persistence, delivery operations and both courier integrations.

The first browser run exposed fixture login-rate exhaustion and a missing address on the new test account. Both were corrected in the isolated fixtures; the final complete browser run passed. The Windows managed web-server teardown stalled, so the final run used the same production build with a separately managed disposable local server and an ignored temporary Playwright configuration. That test server was stopped after verification. No production service was used.

The secret scanner still identifies retired default passwords in old Git blobs. This work does not rewrite history or rotate deployed credentials; any account that still uses such a historical default needs operator reconciliation. No secret values are included in this report.

 Automated tests use synthetic protocol responses and disposable databases only, with no real PayU transaction or MSG91 delivery. Real sandbox and production readiness remain **BLOCKED** until the credential/account/dashboard steps above are evidenced.

## Follow-up: returning without completing payment

The customer reported the pending-confirmation message and confirmed that no money was debited after leaving PayU. A pending result is not proof of payment or cancellation. PayU requires unique IDs for new checkout requests, so a verified pending attempt must return status recovery instead of reposting an already-used ID. A replacement attempt is permitted only after an authoritative terminal failure; it preserves the internal order number and all prior attempts.

The follow-up recognizes both documented `failure` and `failed` provider status variants, normalizes state casing, and records only allowlisted verification states in private order metadata. The customer result describes an open checkout separately from processing. A capture discovered during retry returns the existing paid order instead of another form. No schema migration or manual payment-status change is needed.

Local validation for this follow-up: 149 regression tests passed across 15 files, seven relevant browser tests passed, production build and TypeScript passed, and lint reported zero errors with the four existing image warnings. These checks use disposable databases and local transport fixtures. Publication and production deployment of this follow-up require the user's requested final push approval.

## Complete gateway retirement

The merchant authorized removal of all executable Razorpay integration paths and direct publication. SDK/API clients, signature helpers, automated capture/failure/refund handlers and active credential configuration are removed. Old URLs return HTTP 410. Invoice and history readers retain historical identifiers; a historical paid-stock reconciliation path accepts only an existing paid record and an authorized admin reconciliation. It cannot capture a new legacy payment. New orders default to PayU through additive migration `0011`; existing payment labels, signatures, refunds and references stay unchanged.

The current open-checkout message is generated from PayU's verified `initiated` state. Retiring the old integration does not cancel or complete that PayU attempt. Pending attempts remain unpaid until PayU returns an authoritative final result; they are not forcibly failed, replaced or marked paid.

Retirement validation: 152 regression tests passed across 16 files, 26 browser tests passed, the production build passed, and lint had zero errors (four existing image warnings). The default migration was applied to the existing database without rewriting its 17 orders. The application role retains PayU attempt SELECT/INSERT/UPDATE access. Vercel Production has no Razorpay variable names, and the installed dependency tree no longer contains the Razorpay SDK. The merchant explicitly authorized direct push and deployment for this removal.

## Direct PayU handoff

The merchant requested that Step 4 open the hosted payment page immediately. The summary action now creates the server-priced checkout and submits its signed form directly to PayU. Saved contact details are reused; a customer without a valid email supplies it with delivery details once. The contact endpoint validates the email and updates only the authenticated account. Retry, pending recovery and verified return behavior remain unchanged. No database migration is required.

Validation: 156 regression tests across 16 files and 27 browser tests passed, including saved-contact checkout, first-time contact persistence, direct hosted-form submission, payment return and pending/cancellation recovery. The production build passed; lint reported zero errors and four existing image warnings. Secret scanning found zero current secrets. No real payment was initiated.
