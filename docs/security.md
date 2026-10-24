# Security and production setup

The application uses Next.js App Router, Node.js APIs, Drizzle and PostgreSQL. Supabase client access, AiSensy and browser database keys are not present. Administrator image uploads are stored in PostgreSQL and served by the public image endpoint. Private integration credentials must remain in server-side environment variables. The public Razorpay key ID is returned only for its checkout SDK; signing secrets are never returned.

## Controls

- JWT signatures and algorithms are verified before protected-route redirects. Protected APIs also read the current active account and database role. Delivery permission checks and customer ownership checks are independent of client state.
- OTP authentication is restricted to customer accounts; legacy unverified phone/password registration is disabled. Code hashes, attempts and single-use consumption are handled under a database row lock. Shared database counters limit phone-based sending, guessing, password sign-in and protected writes. Delivery/admin accounts use their dedicated password routes.
- Browser mutations reject cross-origin requests. Request bodies are capped at 64 KiB while reading, not only by their Content-Length header. API responses avoid raw database/provider errors and authentication tokens are delivered through HttpOnly cookies.
- Checkout reprices from database products, validates whole-number quantities, and serializes equivalent checkout creation for an account. Reuse requires matching cart, price and address. Capture confirmation uses a shared locked transaction for checkout and signed webhooks, preventing repeated order items and stock deductions. Authorization alone is not capture. Amount and currency are verified. A late failure cannot overwrite an already captured/refunded payment.
- If capture confirmation is temporarily unavailable, checkout retries the same signed receipt without starting a second payment. An order is shown as confirmed only after its details load successfully.
- Database TLS certificate verification is enabled. Response headers deny framing and object content and limit base URLs, form submissions and sensitive browser permissions. This is a baseline CSP, not a complete nonce-based script policy.
- Seeding is disabled by default and has no default passwords. Existing passwords/accounts previously created with public defaults require operator review and rotation or disablement. Disable compromised accounts and invalidate any previously issued sessions before re-enabling access; rotating JWT_SECRET invalidates all sessions.

## Validation

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run security:secrets` and `npm audit --omit=dev`.

The browser suite builds the production app and runs it against an in-memory PostgreSQL database on a local socket. Test credentials and a known OTP exist only in this disposable database. External SMS delivery and gateway behavior are test doubles in selected browser scenarios; authentication, ownership, OTP verification, shipment persistence and SQL finalization have real database tests. Never point the test harness at a production database.

The local secret scanner checks tracked/untracked intended files, reachable Git text blobs, and generated browser assets. It prints locations and detector names, never values. Intentional isolated fixture values are acknowledged separately. Historical public default credentials are warnings requiring rotation wherever they were deployed. It is a heuristic scan and does not guarantee every possible secret format is detected. Do not rewrite shared history without explicit authorization.

## Database setup

The tracked incremental migrations run from `0001_delivery.sql` through `0009_inventory_reservations.sql`. They extend the existing VPB database; they do not recreate its original catalog/customer/order tables. `npm run db:migrate` uses a migration ledger, checksums and an advisory transaction lock. The first migration preserves legacy courier fields. Review and back up the target database before migrations; use a separate schema-owner connection for DDL.

For a new database, provision the original baseline before these incremental migrations. Do not run current-schema `drizzle-kit push` followed by incremental CREATE migrations against those same freshly created tables. Existing deployments must confirm their migration ledger. Application credentials should have the necessary table DML and schema usage privileges, without CREATE ROLE, CREATE DATABASE, ownership or BYPASSRLS.

Use the restricted application login for `DATABASE_URL`. Migration scripts and Drizzle configuration use `MIGRATION_DATABASE_URL` when supplied, with `DATABASE_URL` as a compatibility fallback. Keep the schema-owner connection only in the local migration environment; do not add `MIGRATION_DATABASE_URL` to Vercel runtime settings. The application login needs schema USAGE, normal application-table CRUD, SELECT/INSERT on the append-only delivery audit and shipment history, and SELECT only on the migration ledger. New migrations must explicitly grant access to any new tables. It must not inherit the owner role or be granted schema CREATE. SQL-created Neon roles avoid the elevated privileges assigned to console-created roles; see [Neon roles](https://neon.com/docs/manage/roles#manage-roles-with-sql).

The October 25 security candidate uses migrations `0008_session_revocation.sql` and `0009_inventory_reservations.sql`. They add a session epoch and an initially empty inventory-reservation table. With the user's subsequent authorization, both were applied to the existing database after an encrypted backup and full local restore/migration rehearsal. Read-only fingerprints of all 22 existing business tables matched the restored backup afterward. The restricted runtime role has reservation DML and still cannot create schema objects or rewrite issued invoices. See the local migration/staging report for evidence; application code has not been deployed.

Logout revokes all sessions for that account. Password/phone changes and account disabling invalidate existing cookies through the database epoch; existing sessions start at epoch zero. Product locks and 30-minute reservations protect new checkouts, with at most three active reserved carts per account. Expired/cancelled or otherwise unallocatable captures retain the payment record on a fulfillment hold. An administrator must correct inventory and explicitly confirm the held order before invoicing/notification. Partial processed refunds are recorded idempotently by provider refund ID; full cumulative refunds remain refunded even if capture arrives later. This ledger does not issue refunds or tax credit notes.

Renflair's documented OTP endpoint transmits its API key and OTP in the outbound HTTPS query string. The application does not log or return that URL, but provider/proxy URL logging remains a residual risk. Obtain a supported body/header-authenticated transport from the provider before changing that existing integration; no substitute protocol was invented.

## Vercel checklist

Use the Next.js framework preset, repository root, `npm ci`, `npm run build`, and the default framework output. Keep NEXT_OUTPUT_DIR unset. Node 24.x or 22.x is supported by Vercel; Next requires Node >=20.9. [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [supported Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Required environment variable names:

- DATABASE_URL
- JWT_SECRET
- RAZORPAY_KEY_ID
- RAZORPAY_KEY_SECRET
- RAZORPAY_WEBHOOK_SECRET
- RENFLAIR_API_KEY

Do not enable ALLOW_SEED or configure seed account variables for a normal production deployment. JWT_SECRET must be a strong random value of at least 32 characters. Configure separate preview/test credentials and databases, verify pooled database capacity and function-region latency, and configure the official domain and HTTPS webhook endpoint `/api/payment/webhook` in Razorpay. Ensure the provider captures payments and the SMS sender/template is approved. Verify webhook delivery, captures, cancellation, retries and refunds in staging before using live funds. Never expose a development server publicly.

The repository is connected to Vercel. `vercel.json` enables automatic Git deployments for `main` and disables other branches. The explicit `main: true` rule takes precedence when it also matches the wildcard denial. Preview variables are not configured; provision separate preview credentials and a test database before enabling preview branches. Production must use the restricted application database login. Manual CLI/dashboard deployments are not blocked by this setting and require authorization. See [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration#branches-matching-multiple-rules).

Dashboard configuration, real SMS delivery and live payment acceptance require operator validation; successful local tests do not prove them. Automatic email password reset is unavailable; the UI provides truthful OTP/support alternatives.

## Dependency notes

The October 25 local candidate pins Next.js and eslint-config-next to 16.4.3 and sharp to 0.35.5, and resolves Zod 4.6.6. The production dependency audit reports zero known findings. Four moderate development-tool findings remain in the Drizzle Kit / esbuild-kit / esbuild chain; the vulnerable esbuild dev-server is not used by the Next.js runtime. Do not use `npm audit fix --force` to downgrade framework or schema tools. Keep development tooling local and trusted. Lint has zero errors and four existing native-image warnings.

See [the October 25 local audit](security-audit-2026-10-25.local.md) for findings, exact test evidence, limitations and the release gate. Subsequent authorized migration and integration verification is recorded in [the migration/staging report](security-migration-staging-audit-2026-10-25.local.md). No Git push or deployment has been performed.
