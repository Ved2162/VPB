# Manual delivery operations

## Setup and access

1. Install the locked dependencies with `npm ci`.
2. Back up the existing database using your database provider's backup workflow.
3. Run `npm run db:migrate` against the application's existing `DATABASE_URL` before deploying this code. The migration is additive and transactional. The runner records a checksum and serializes concurrent migration runs; subsequent runs are no-ops. Do not use `drizzle-kit push` in place of the tracked migration.
4. Start with `npm run dev`, or `npm run build` followed by `npm start`.
5. Sign in as an existing main admin and open **Staff & couriers** at `/admin/delivery`. This page shows only staff accounts, permissions and courier configuration, without shipment tables or shipment counts.
6. Add the actual courier providers used by the business, with their official HTTPS tracking URLs. No providers or staff accounts are seeded by the migration.
7. Create delivery staff with unique mobile numbers and passwords of at least 12 characters. Share passwords through your normal secure process. Staff sign in at `/delivery/login`.
8. Shipment operations are separate at `/delivery`. The main admin retains access there to assign orders through **Edit courier**. Staff normally see only assigned orders. The main admin can explicitly enable **Allow access to all orders** per staff account, or disable the account to revoke access immediately.

If the admin session ends while creating staff or editing a provider, a sign-in dialog preserves the current form in memory and retries the save after successful admin authentication. Form passwords are never written to browser storage. Staff creation does not require creating a courier first.

The delivery dashboard reloads after every save, when the window regains focus, and every 15 seconds while visible and no editor is open. Open editors retain their version so concurrent edits still receive a conflict instead of silently overwriting newer data. Browser requests bypass cached responses. The floating Next.js development indicator is disabled through `devIndicators: false`.

Main admin login is at `/admin/login` and accepts the admin ID stored in `users.username`. Delivery staff continue to sign in by mobile number at `/delivery/login`. The shipment dashboard has no main-admin navigation option; every admin API also checks the current account role. Existing customer checkout and payment URLs remain unchanged. The seed endpoint requires an authenticated admin POST; GET no longer seeds data.

`migrations/0002_admin_username.sql` adds a nullable unique username to existing users. Run `npm run db:migrate` to apply all pending migrations. To set or rotate the main admin's credentials, run `node scripts/configure-admin.mjs` and provide a single JSON line on stdin containing `username`, `password`, and the existing admin's `phone`. Input is hidden in interactive terminals. The script only updates the matching active admin, hashes the password with bcrypt, and never prints credentials. Passwords are not hardcoded in application source.

Main admins can delete staff from **Staff & couriers**. Deletion requires confirmation, immediately revokes access, releases assignments, increments affected shipment versions, and records assignment changes and deletion in the audit trail. Shipment statuses, courier details and past actor names/history are retained. Other roles and the main admin account cannot be deleted through this endpoint.

Login updates the auth state from the verified login response immediately, without waiting for another session fetch. Session refreshes use a sequence guard so an older request cannot overwrite a newly signed-in account. Admin statistics, shipment counts/rows/summaries, providers and staff use parallel database reads where independent. Pool connections remain available longer, with a bounded connect timeout. These changes reduce database round trips without caching permission checks or compromising immediate account revocation.

## Daily workflow

Search by order number/UUID, customer, phone or AWB. Filter by courier, shipment status, payment status and order date (India timezone); sort by date, order ID, customer or update time. Results are paginated, 20 per page. Summary cards describe all orders within the signed-in staff member's permission scope.

Select a courier and enter an AWB/docket number. A tracking URL is optional, but must be HTTPS on the exact hostname configured for that provider, without credentials, IP addresses, private hostnames or custom ports. Enter the complete courier tracking URL; the application does not scrape courier websites or synchronize statuses automatically. Providers can be renamed or deactivated. Existing links remain available for old shipments, but inactive providers cannot be newly assigned.

Statuses follow these transitions:

| Current | Allowed next statuses |
| --- | --- |
| Not assigned | Assigned, Cancelled |
| Assigned | Pickup pending, Picked up, Cancelled |
| Pickup pending | Picked up, Cancelled |
| Picked up | In transit, Return to origin |
| In transit | Out for delivery, Delivery failed, Return to origin |
| Out for delivery | Delivered, Delivery failed, Return to origin |
| Delivery failed | Out for delivery, In transit, Return to origin |
| Delivered, Return to origin, Cancelled | Terminal; courier details and staff assignments can still be corrected |

Courier and docket are required for operational statuses. Staff assignment alone does not guess courier progress. Shipment status is independent of order and payment status, including delivered shipments. Admins continue to manage order/payment status in the original Orders panel. No estimated delivery date is displayed because none has been supplied.

## Data and permission boundaries

`migrations/0001_delivery.sql` adds `delivery_staff`, `delivery_providers`, `shipments`, `shipment_status_history`, `delivery_audit`, and `delivery_rate_limits`, plus indexes. Orders and users remain the authoritative records. Existing courier fields are copied into shipments without guessing shipment status. No order or payment records are deleted or reseeded. Migration runs are recorded in `vpb_migrations`.

Every delivery API verifies a signed JWT, the current account's active flag and role, and its current database permissions. Page rendering also verifies the account. Delivery staff cannot assign/reassign orders, manage staff/providers, access admin operations, or change orders, products, customer records or payment records. Main-admin changes to staff and providers are recorded in `delivery_audit` without password hashes.

Shipment updates lock the order, check permissions again inside the transaction, use an optimistic version number, synchronize the legacy courier fields, and record before/after snapshots atomically. Identical retries are no-ops; stale conflicting saves return HTTP 409 and ask staff to refresh. Staff can review the newest 200 shipment history entries in the editor. All history is retained in the database.

Customer tracking uses the existing `/api/orders/[id]` route, verifies ownership before returning an order, and projects only public shipment fields. Internal notes, actor identities, staff assignments, payment signatures and raw payment data are excluded from that response. The customer timeline shows up to 200 recent events.

Delivery login is limited to 10 attempts per normalized phone number per 15 minutes. Delivery writes are limited to 90 per account per minute, using shared database counters. Mutation routes reject cross-origin browser requests and unknown fields. No courier API keys are needed.

## Tests

- `npm test`: real SQL through an ephemeral PGlite PostgreSQL engine, applying the actual migration to the existing baseline schema. Covers authentication, restricted/shared access, revoked accounts, filtering, sorting, pagination, assignments, URL validation, valid/invalid transitions, stale/concurrent duplicate saves, audit history, customer isolation, admin restrictions, product management and payment verification regression checks.
- `npm run test:e2e`: builds the production bundle, then starts a disposable PostgreSQL socket adapter and the actual production app on `127.0.0.1:3100`. Playwright exercises admin setup, staff login, desktop/mobile rendering, persistent courier saves, status updates, private notes, customer tracking and account disablement. Ports 3100 and 54329 must be available. The harness overrides credentials before Next starts and never uses the live database or payment/SMS providers. It uses installed Chrome on Windows, or Playwright Chromium (`npx playwright install chromium`) elsewhere.
- `npm run typecheck` and `npm run build` verify the TypeScript and production compilation.

Browser screenshots and traces are saved under ignored `test-results/`. Test accounts and orders exist only in memory. No live charge, OTP SMS, or courier API call is made by these tests.
