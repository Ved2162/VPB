# VPB project context for any AI

Last reviewed: **30 October 2026 (Asia/Kolkata)**. This is a portable project handoff: paste this entire file into another AI, or ask an AI with repository access to read it first. It describes the repository at address-update commit `3e1e7e3`; future changes may supersede these details.

## 1. Start here

You are helping maintain **VPB — Verai Patang Bhandar**, an existing full-stack ecommerce website. Continue the existing application and design. Read the actual files before changing behavior; preserve saved products, images, customers, orders, stock, payment attempts, receipts, and admin edits.

If you only have this pasted document, you have context, not access to GitHub, Vercel, the database, credentials, or the user's computer. Do not claim to have inspected, changed, tested, pushed, or deployed anything without tool evidence.

At the start of repository work:

1. Read `AGENTS.md` and any more specific instructions in the files' directories.
2. Inspect `git status --short`, the current branch, remotes, and recent history. Preserve unrelated user changes.
3. Read relevant existing source and feature documentation listed below.
4. **Before writing Next.js code, read the relevant bundled guide in `node_modules/next/dist/docs/`.** This project's `AGENTS.md` explicitly warns that its Next.js version has breaking changes. Do not assume APIs from older versions. Install locked dependencies first if these docs are missing.
5. Implement the requested work, run checks appropriate to it, and report the result accurately.

This file is project context, not blanket permission for future production changes. Follow the user's current request and any authorization already given for that task. When the user explicitly asks to push, carry out the commit and push after checks; do not repeatedly ask for the same authorization.

## 2. Business identity and contact details

| Item | Value |
| --- | --- |
| Business | Verai Patang Bhandar |
| Short name | VPB |
| Store positioning | Premium pure-cotton Bareilly manjha; pan-India delivery |
| Address | Verai Patang Bhandar, Swagat Park Society, Khodiyar Mandir, 1, Nicol Gam, Nikol, Gujarat 382350 |
| Phone | +91 90811 11697 |
| WhatsApp | https://wa.me/919081111697 |
| Instagram | https://www.instagram.com/verai_patang_bhandar |
| Local workspace used by the owner | `C:\Users\VED\OneDrive\Desktop\VPB\vpb` |

Shared public contact constants live in **`src/lib/data.ts`**. Both the contact page and global footer import `ADDRESS` and `ADDRESS_MAPS_URL`. The Maps URL is generated with `encodeURIComponent(ADDRESS)` so it stays consistent. The previous address containing `Cluster Nikol 4` and postcode `380049` was replaced on 30 October 2026.

Receipt seller details are separate server environment settings (`INVOICE_*`) and are frozen when a receipt is issued. Changing the public address does not rewrite historical receipts or automatically change Vercel's invoice environment variables.

The business name contains “Patang,” but the current public catalog deliberately excludes kite-only products/categories through `src/lib/catalog.ts` and catalog identity rules. Do not accidentally restore excluded catalog entries or invent product specifications, coating claims, reviews, or tax details.

## 3. GitHub, hosting, and where to push

| Item | Repository evidence / established workflow |
| --- | --- |
| GitHub repository | https://github.com/Ved2162/VPB |
| Git remote | `origin` → `https://github.com/Ved2162/VPB.git` |
| Production code branch | `main` |
| Hosting | Vercel |
| Vercel project name | `vpb` (local `.vercel/project.json`) |
| Documented public website | https://www.vpbbarelimacker.com |
| Preview branch explicitly enabled | `codex/payu-sandbox` |
| Deployment configuration | `vercel.json`, `next.config.ts`, plus Vercel dashboard settings |

The public domain is recorded in `docs/payu-sandbox-validation.md` and `docs/payu-checkout-repair.md`. This handoff does not independently verify current domain health or dashboard settings. The database is PostgreSQL; the code supports Neon, but the actual production database account, host, and region must be confirmed privately rather than guessed.

`vercel.json` enables Git deployments for `main` and `codex/payu-sandbox` and disables other branches with `"*": false`. The established production workflow is **commit → push `origin main` → Vercel builds/deploys automatically** when its Git integration is active. A feature-branch push does not necessarily produce a preview under this configuration.

When the user asks to publish a completed change:

```sh
git status --short
git branch --show-current
git remote -v
git diff --check
git diff
# Stage only the files belonging to the requested change:
git add <changed-files>
git commit -m "Describe the completed change"
git push origin main
```

Confirm you are on the intended branch first; do not blindly switch branches over uncommitted work. If Git reports remote changes, inspect and integrate them while preserving both sets of work. Do not force-push or reset the owner's changes. In managed environments, `.git` writes or network access may need tool-level permission even when the user has authorized the push.

The most recent established push in this session was **`3e1e7e3` — `Update store address and Google Maps link`**, successfully pushed to `origin/main`. Earlier commits include `b2f8e75` (storefront performance) and `35a7e76` (branding/product specifications). These are reference points, not a permanent claim about the latest branch head.

**A successful push is not proof of a successful Vercel deployment.** Inspect the deployment result and relevant live behavior when access is available; otherwise report only what was verified. Build-time environment changes require a new deployment. Database migrations are separate and are not run by `npm run build`.

## 4. Stack and application shape

| Layer | Current repository setup |
| --- | --- |
| Framework | Next.js `16.4.3`, App Router |
| UI | React `19.2.6`, TypeScript, Tailwind CSS v4, Lucide icons |
| Backend | Next.js route handlers in `src/app/api/` |
| Database | PostgreSQL via `pg` and Drizzle ORM |
| Authentication | JWT in HttpOnly `vpb_token` cookie; bcrypt passwords; SMS OTP flows |
| Payments | PayU India classic Hosted Checkout (`_payment`), INR |
| SMS OTP | Renflair, server-side |
| WhatsApp order confirmations | MSG91, durable database notification queue |
| Receipts | PDFKit + SVG logo + bundled Noto Sans fonts |
| Tests | Vitest, disposable PGlite databases, Playwright |

This is one Next.js application containing the storefront, admin UI, delivery UI, and backend. There is no separate backend service to start.

The design uses a warm cream, maroon, and gold palette with serif display typography and kite/manjha imagery. Shared UI is in `src/components/site.tsx`; preserve consistency and mobile usability when extending pages.

## 5. Main pages and code map

| Location | Purpose |
| --- | --- |
| `src/app/page.tsx` | Homepage and promotional content |
| `src/app/shop/page.tsx` | Searchable/filterable catalog |
| `src/app/product/[slug]/page.tsx` | Product detail, images, specifications, reviews |
| `/about`, `/craftsmanship`, `/contact` | Business/story/contact pages |
| `/cart`, `/checkout` | Cart and checkout |
| `/login`, `/register`, `/forgot-password`, `/account` | Customer access and account |
| `/track-order` | Order tracking UI; API access rules still apply |
| `/admin/login`, `/admin` | Main admin access and management dashboard |
| `/admin/delivery` | Admin management of delivery staff and courier providers |
| `/delivery/login`, `/delivery` | Staff login and shipment operations |
| `src/app/layout.tsx`, `src/app/globals.css` | Root layout, metadata, global styling |
| `src/components/site.tsx` | Header, footer, product cards, shared UI |
| `src/lib/data.ts` | Business/contact constants and static assets |
| `src/lib/store.tsx`, `browser-state.ts` | Cart/auth/toast state and browser persistence |
| `src/lib/api-client.ts`, `use-api-resource.ts` | Shared API requests and loading/retry behavior |
| `src/lib/catalog.ts`, `catalog-identity.ts`, `reviews.ts` | Public catalog eligibility and review rules |
| `src/lib/product-specs.ts` | Validated specifications; legacy objects and ordered rows |
| `src/lib/product-images.ts`, `product-image-delivery.ts` | Upload validation and responsive image serving |
| `src/db/schema.ts`, `src/db/index.ts` | Database tables and pooled connection |
| `src/lib/auth.ts`, `delivery-server.ts`, `http-security.ts` | Sessions, active-user checks, permissions, request limits |
| `src/proxy.ts` | Page access redirects, API origin/body/cache guards |
| `src/lib/payu*.ts`, `payment-finalization.ts`, `inventory.ts` | Payment protocol, reconciliation, inventory and fulfillment |
| `src/lib/invoices.ts`, `invoice-pdf.ts`, `invoice-types.ts` | Permanent receipt snapshots and PDF output |
| `src/lib/msg91*.ts`, `order-notifications.ts`, `schedule-order-notification.ts` | WhatsApp template checks, queue and retries |
| `src/lib/couriers.ts`, `shipment-rules.ts` | Courier allowlists and shipment validation |
| `migrations/`, `scripts/migrate.mjs` | Reviewed SQL migrations and checksum ledger |
| `public/`, `assets/` | Public site assets, source imagery, PDF fonts |
| `tests/`, `tests/e2e/`, `tests/sandbox/` | Unit/integration, local browser, explicit PayU sandbox tests |

## 6. How a purchase works

1. The storefront loads eligible active products, categories, prices, stock, specifications, images, and approved reviews from the database. Demo reviews do not contribute to real aggregate ratings.
2. The browser persists the cart locally. Browser totals and stock are not authoritative.
3. The customer signs in, supplies/selects a saved delivery address, and provides a valid email required by PayU. OTP routes are under `/api/otp/send` and `/api/otp/verify`.
4. `/api/payment/create` validates the customer/cart/address, reprices from the database, handles request idempotency, reserves inventory, creates/reuses an internal order, and stores a PayU attempt.
5. The current pricing rule is free shipping and a **Rs 200 discount for subtotal >= Rs 6000**. Product/order prices are integer rupees; PayU attempt amounts use integer paise. Check conversions before modifying money code.
6. The browser posts server-signed fields to the fixed PayU hosted endpoint. The merchant salt stays server-side. Payment method selection happens on PayU.
7. The return/webhook validates the reverse hash and stored transaction binding, then verifies with PayU server-to-server. Only matching captured success can confirm payment.
8. The locked finalizer updates payment/stock/order items and enqueues one durable WhatsApp notification. Receipt issuance follows separately so a PDF or notification failure cannot undo verified payment.
9. The customer can recover the result through checkout/account. Authorized staff later enter courier/docket information and update shipment progress.

Important payment endpoints:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/payment/create` | Prepare trusted checkout and signed hosted form |
| `POST /api/payment/retry` | Reconcile previous attempt before permitting retry |
| `/api/payment/payu/return` | Browser success/failure/cancellation return |
| `/api/payment/payu/webhook` | Signed payment notifications |
| `POST /api/payment/payu/verify` | Authenticated owned-order reconciliation |
| `GET /api/payment/payu/status` | Sanitized configuration/schema readiness |
| `/api/orders`, `/api/orders/[id]` | Protected order reads and permitted updates |
| `/api/orders/[id]/invoice` | Owner/admin PDF receipt access |

Use the canonical application origin for PayU return/webhook URLs. Do not infer payment success from a redirect, query parameter, screenshot, browser message, or unverified webhook. Pending/unknown verification stays pending. New attempts require authoritative terminal failure of the previous attempt; never delete attempts to bypass recovery.

**Razorpay is retired.** Historical identifiers and records remain for compatibility. `/api/payment/verify`, `/api/payment/failed`, and `/api/payment/webhook` return HTTP 410. Do not restore the old SDK, reactivate these handlers, rewrite historical provider labels, or remove historical evidence during routine maintenance. Automatic PayU refund/dispute handling is not implemented by the payment webhook.

## 7. Authentication, administration, and fulfillment

- JWT sessions last 14 days, with sliding renewal. APIs check the active database account, role, and session version. Page redirects alone are not authorization.
- Roles are `customer`, `admin`, and `delivery`. Customers must not access another customer's orders, addresses, or receipts.
- Main admin signs in using `users.username` at `/admin/login`. Delivery staff sign in by mobile number at `/delivery/login`. Customer registration uses OTP; the legacy password-register action is disabled. Password login support also exists in the auth API.
- `scripts/configure-admin.mjs` rotates an existing admin's username/password using JSON on stdin. It writes to the configured database and invalidates existing sessions; do not run it casually or put credentials in shell arguments.
- The forgot-password API currently directs customers to WhatsApp support; do not claim a complete automated password reset exists.
- Staff normally see assigned orders; an admin can explicitly allow broader access. `/admin/delivery` manages access/providers; `/delivery` manages actual shipments.
- Courier tracking is manually maintained using approved provider links and docket numbers. It is not a carrier booking or automatic carrier-status integration. Consult `docs/courier-tracking.md` for the current allowlist.
- Shipment history/audit and receipt snapshots are historical records. Preserve their append-only behavior and restricted permissions.

## 8. Persistence, migrations, and images

PostgreSQL stores the live business data. Key groups include:

- Catalog: `categories`, `products`, `product_images`, `reviews`, `banners`, `site_content`.
- Accounts: `users`, `addresses`, `cart_items`, `otp_requests`.
- Commerce: `orders`, `order_items`, `payu_attempts`, `inventory_reservations`.
- Notifications/receipts: `order_notifications`, `invoice_counters`, `order_invoices`, `invoice_cancellations`.
- Delivery: `delivery_staff`, `delivery_providers`, `shipments`, `shipment_status_history`, `delivery_audit`, `delivery_rate_limits`.
- Migration runner ledger: `vpb_migrations`.

Admin product edits and uploaded images survive app redeployments because they are stored in PostgreSQL. Preserve the production database connection and backups; changing repositories/builds does not move business data.

Uploads support JPEG/PNG/WebP/GIF up to 4 MB, with content validation. Permanent URLs are `/api/images/<sha256>`. Responsive delivery generates bounded image variants and uses immutable caching. Originals stay intact. External image URLs still depend on their external hosts.

`next.config.ts` sets `images.unoptimized: true`; the generic `/_next/image` optimizer is blocked. The custom upload endpoint supplies responsive images. Do not reintroduce unrestricted remote optimization. Catalog queries remain fresh; private APIs use no-store. Decorative videos defer loading and respect visibility/reduced-motion/data-saving behavior.

For an **existing database**, use the reviewed runner:

```sh
npm run db:migrate
```

It uses `MIGRATION_DATABASE_URL`, falling back to `DATABASE_URL`, and applies registered migrations `0001`–`0012` with a transaction, advisory lock, and checksums. Do not edit applied migrations. Add a new migration and register it in the runner, with necessary restricted-role grants and tests. `0012_product_content.sql` includes guarded catalog data corrections, so migrations are not necessarily schema-only.

Production database work needs the user's authorization, a backup, and staging verification. Keep migration-owner credentials separate from Vercel runtime credentials. **Do not use `drizzle-kit push` as a shortcut on an existing production database.** The older README contains that command; the migration/security guides give the safer existing-database workflow.

The incremental migrations assume the original baseline already exists. For a brand-new empty database, plan baseline provisioning separately; running the current schema push and then the incremental CREATE migrations can conflict. The disposable test harness demonstrates a baseline-plus-migrations setup but is not a production provisioning script.

`/api/seed` requires an authenticated admin POST and `ALLOW_SEED=true`. It only populates a completely empty catalog and otherwise skips changes. Do not use seeding to repair live catalog data or recreate deleted products.

## 9. Environment configuration — names only, no secrets

Use **`.env.example`** as the full template. Local `.env*` files and `.vercel/` are ignored. Never paste private values into this handoff, source, logs, commits, or chat. Vercel environment settings must be configured for the intended Production/Preview environment; local files do not synchronize themselves to Vercel.

| Group | Variables / purpose |
| --- | --- |
| Database | `DATABASE_URL`; optional local owner `MIGRATION_DATABASE_URL` |
| Sessions | `JWT_SECRET` — at least 32 random characters |
| PayU | `PAYU_ENABLED`, `PAYU_ENV`, `PAYU_CURRENCY`, `PAYU_MERCHANT_KEY`, `PAYU_MERCHANT_SALT`, `PAYU_BASE_URL` |
| SMS | `RENFLAIR_API_KEY` |
| WhatsApp | `MSG91_WHATSAPP_ENABLED`, `MSG91_AUTH_KEY`, `MSG91_WHATSAPP_NUMBER`, `MSG91_TEMPLATE_NAME`, `MSG91_TEMPLATE_LANGUAGE`, `MSG91_TEMPLATE_NAMESPACE`, `MSG91_TEMPLATE_BODY_VARIABLES`, `MSG91_TEMPLATE_AMOUNT_FORMAT` |
| Worker | `CRON_SECRET` — separate strong bearer secret |
| Receipts | `INVOICE_SELLER_NAME`, `INVOICE_SELLER_ADDRESS`, `INVOICE_SUPPORT_PHONE`, `INVOICE_SUPPORT_EMAIL` |
| Optional setup | `ALLOW_SEED`, `SEED_ADMIN_PHONE`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_PHONE`, `SEED_DEMO_PASSWORD` |

The template defaults disable PayU, WhatsApp, and seeding. Those defaults do not prove what production currently uses. Payment reports record different test/live configurations at different times; check actual Vercel settings and sanitized readiness before asserting the current gateway mode. A Vercel Production deployment can still run PayU test mode.

MSG91 confirmations use approved Utility templates with exact sender/language/namespace/placeholder mapping. Pending template approval leaves notifications queued. API acceptance is not proof of delivered/read status. The durable queue supports reconciliation and bounded retries; never blindly resend accepted or ambiguous attempts.

`vercel.json` schedules `/api/internal/whatsapp` daily at `0 3 * * *` (03:00 UTC / **08:30 IST**). Normal verified checkouts can also schedule after-response work. The cron is a recovery path, not an instant template-approval callback. Real SMS/WhatsApp calls and gateway transactions are external actions; use isolated fixtures for routine tests.

Receipts are **basic order receipts, not GST tax invoices**. Do not invent GSTIN, HSN, taxes, or compliance claims. Seller/contact changes affect only newly issued snapshots. PDFs require the bundled fonts/logo configured in `next.config.ts`.

## 10. Local development and verification

Use Node.js 20.9+ as documented by the project and the committed npm lockfile. The owner's machine uses Windows/PowerShell; other environments may use their native shell.

```sh
npm ci
```

Create a private local `.env` from `.env.example` and configure a **development** database and secrets. On PowerShell:

```powershell
Copy-Item .env.example .env
npm run dev
```

Development normally serves `http://localhost:3000`. Be aware that a local `.env` could point at production: identify the target privately before running any database-writing operation. Runtime database access and authenticated routes need working environment settings; a build alone is not a functional integration test.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Vitest suite with disposable databases/transport doubles |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run test:e2e` | Build, then Playwright local browser suite |
| `npm run security:secrets` | Repository secret scan; inspect scanner scope before use |
| `git diff --check` | Whitespace/error check before commit |

Choose checks based on the change. For payment/auth/database changes, include relevant regression tests and a build. For a documentation-only change, inspect content, paths, links, secret exposure, and diff formatting; an application build is generally unnecessary.

Vitest uses `tests/**/*.test.ts` and isolated PGlite fixtures. Playwright's normal config runs a disposable local app/database at `127.0.0.1:3100` using `scripts/e2e-server.mjs`. On Windows it can use installed Chrome; elsewhere provision a supported Playwright browser. Previous reports note Windows server teardown stalls: inspect the owned process before cleanup, and do not stop unrelated Node processes.

The separate PayU sandbox config/tests opt into real TEST gateway traffic. They are not part of ordinary offline verification and require deliberate configuration. Local mocks do not establish live payment acceptance, webhook delivery, SMS delivery, or WhatsApp delivery. Old test totals in reports are historical results; rerun relevant checks before claiming a current pass.

For deployment review, inspect Vercel build/function logs, public page behavior, and, where relevant, `GET /api/health` and `GET /api/payment/payu/status`. Treat readiness endpoints as limited diagnostics, not proof of end-to-end checkout. Do not expose credentials or customer data in debugging output.

## 11. Feature documentation to read next

Paths below are relative to the repository root. For this file in `docs/`, Markdown links point to neighboring files.

| Document | Use when working on |
| --- | --- |
| [README](../README.md) | General orientation; some deployment/setup passages are historical |
| [Security](security.md) | Runtime database roles, origin checks, sessions, release practices |
| [PayU migration](payu-migration.md) | Protocol, attempts, historical compatibility, rollout and reconciliation |
| [PayU checkout repair](payu-checkout-repair.md) | Hosted form/navigation, CSP and live incident evidence |
| [PayU sandbox validation](payu-sandbox-validation.md) | Dated sandbox/domain configuration and actual test limits |
| [WhatsApp](whatsapp.md) | Template approval, durable queue, diagnostics and delivery verification |
| [Receipts](invoices.md) | Issuance, immutable snapshots, permissions and PDF sharing |
| [Delivery](delivery.md) | Staff setup, assignments, permissions and shipment editing |
| [Courier tracking](courier-tracking.md) | Official provider allowlists and tracking behavior |
| [Loading](loading.md) | Shared loaders, bounded requests and retry UX |
| [Catalog, favicon, reviews](catalog-favicon-reviews-update.md) | Public catalog exclusions, branding and review moderation |
| [Product content](product-content-update.md) | Product names/specifications, admin editing and migration 0012 |
| [Performance](performance-update.md) | Responsive images, catalog reads, deferred video and measurements |

These reports describe work at particular checkpoints. A sentence such as “not deployed,” “testing blocked,” or a test count is not automatically the current project state. Prefer current code/configuration, Git history, and verified deployment/provider evidence. Local security audit files marked `*.local.md` are intentionally ignored and may contain private diagnostics; do not publish them.

## 12. Keep this handoff useful

Update this file when the domain, repository, production branch, deployment workflow, major integrations, business contact details, or architecture changes. Record a review date and distinguish implementation from verified operational status. Keep secrets and customer records out. When finishing work, tell the owner what changed, what passed, whether anything was pushed, and whether deployment was actually verified.
