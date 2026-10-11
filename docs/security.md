# Security and production setup

The application uses Next.js App Router, Node.js APIs, Drizzle and PostgreSQL. Supabase client access, AiSensy, uploads and browser database keys are not present. Private integration credentials must remain in server-side environment variables. The public Razorpay key ID is returned only for its checkout SDK; signing secrets are never returned.

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

The tracked incremental migrations are `0001_delivery.sql` and `0002_admin_username.sql`. They extend the existing VPB database; they do not recreate its original catalog/customer/order tables. `npm run db:migrate` uses a migration ledger, checksums and an advisory transaction lock. The first migration preserves legacy courier fields. Review and back up the target database before migrations; use a separate schema-owner connection for DDL.

For a new database, provision the original baseline before these incremental migrations. Do not run current-schema `drizzle-kit push` followed by incremental CREATE migrations against those same freshly created tables. Existing deployments must confirm their migration ledger. Application credentials should have the necessary table DML and schema usage privileges, without CREATE ROLE, CREATE DATABASE, ownership or BYPASSRLS.

No new database migration is required by the security or animation changes. OTP and rate-limit tables are reused. Stock is not reserved during checkout: concurrent independent purchases can exceed available inventory before capture. Captured orders are retained and marked with `payment_data.stockReviewRequired` when stock is short; operations must reconcile those cases. This is not an inventory-reservation system. Partial refunds and real gateway event ordering require staging acceptance before live launch.

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

The repository is connected to Vercel. `vercel.json` sets `git.deploymentEnabled` to `false` so GitHub updates do not automatically release while the security and integration checks remain unresolved. This also disables automatic preview deployments. Keep this guard until the release checks pass and deployment is explicitly approved; then remove it or set the property to `true`. Manual CLI/dashboard deployments are not blocked by this setting and still require approval. See [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments).

Dashboard configuration, real SMS delivery and live payment acceptance require operator validation; successful local tests do not prove them. Automatic email password reset is unavailable; the UI provides truthful OTP/support alternatives.

## Dependency notes

Next.js and eslint-config-next were aligned at 16.4.0 and PostCSS updated to 8.5.29 after advisory review. The production-only npm audit returned zero known findings. The complete audit still reports nine development-tool dependency findings in the braces/micromatch/ESLint and esbuild/Drizzle Kit chains (five high, four moderate). Do not use `npm audit fix --force` to downgrade framework or schema tools. Monitor compatible fixes and keep build/dev tooling limited to trusted code and local access. Three native-image lint warnings remain; lint has no errors.
