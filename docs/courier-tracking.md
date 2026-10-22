# Official courier tracking

VPB supports Shree Anjani and Shree Maruti in the existing Courier Shipments editor. Main admins can assign orders to delivery staff; restricted staff can read and edit only assigned orders. Existing explicitly granted all-order access remains supported. Customers can read only their own orders.

## Database setup

Run `npm run db:migrate` as part of the approved release. Migration `0006_official_couriers.sql` adds the two official provider rows, reusing `delivery_providers`, `shipments`, order courier/tracking fields, and shipment history. It is transactional through the existing migration runner and safe to execute repeatedly. A matching provider name keeps its ID and active setting; only its configured base URL is corrected. It does not rewrite legacy providers, shipments, assignments, customer records, invoices, payment data, or history.

The connected database schema was inspected read-only during implementation. This migration was tested in disposable PostgreSQL-compatible databases and has not been applied to the live database. No new secrets or courier API credentials are required. Both providers start active when newly inserted. Existing inactive records can be enabled in `/admin/delivery`.

## Verified official link behavior (22 October 2026)

| Provider | Configured official base | Link behavior |
| --- | --- | --- |
| Shree Anjani | https://shreeanjani.co.in/tracking/ | Adds `?awb=` with `encodeURIComponent(docket)`. The official tracking module reads `awb` and fills its AWB input. A headless Chrome check verified input value `0000000000`; the results request was blocked. |
| Shree Maruti | https://shreemaruti.com/track-shipment/ | Adds `?awb=` with `encodeURIComponent(docket)`. Official page JavaScript reads `awb` and changes its tracking iframe URL. A headless Chrome check verified `https://tracking.shreemaruti.com/VPB-TEST-001`. |

These checks establish URL/form behavior, not real shipment validity or delivery status. A real docket from each courier is still needed to check that courier's actual tracking response. No tracking results are scraped or imported, and no CAPTCHA is bypassed. If an official site changes, customers can copy the saved docket and enter it manually.

All customer links are generated from the two constants in `src/lib/couriers.ts`, rather than historical URLs or arbitrary staff input. Provider names have an explicit allowlist. The backend derives the link from the provider and saved docket, checks required fields, permissions, version conflicts, and existing status transitions, and records each actual edit once. Docket correction does not require changing shipment status. Legacy data remains stored; unsupported provider URLs are not exposed as outbound tracking links.

Customer order details and history show the courier, docket, Copy Tracking ID, Track Shipment, internal shipment status, and actual stored history. Clipboard API and legacy copy fallback are supported, with manual-copy instructions if both fail. Tracking actions require a supported courier and valid docket. No approved Anjani/Maruti logo assets existed in the repository, so no third-party logos were added.

The existing invoice PDF/download/share controls, payment finalization, and MSG91 confirmation flow remain in place. Saving shipment data writes no order, invoice, or notification records beyond updating the existing order's courier/tracking fields. No dispatched-message integration existed to modify. Checkout confirmation displays that tracking becomes available after dispatch.

## Files changed

- Courier definitions and validation: `src/lib/couriers.ts`, `src/lib/shipment-rules.ts`.
- Staff workflow and customer data: `src/app/api/delivery/settings/route.ts`, `src/app/api/delivery/shipments/route.ts`, `src/app/api/delivery/shipments/[id]/route.ts`, `src/app/api/orders/route.ts`, `src/app/api/orders/[id]/route.ts`.
- UI: `src/components/courier-tracking.tsx`, `src/components/shipment-timeline.tsx`, `src/components/delivery-editor.tsx`, `src/components/delivery-settings.tsx`, `src/app/account/page.tsx`, `src/app/checkout/page.tsx`.
- Database and test setup: `migrations/0006_official_couriers.sql`, `scripts/migrate.mjs`, `scripts/e2e-server.mjs`, `tests/database.ts`.
- Tests: `tests/couriers.test.ts`, `tests/delivery.test.ts`, `tests/migration.test.ts`, `tests/e2e/couriers.spec.ts`, `tests/e2e/delivery.spec.ts`.
- Documentation: `README.md`, `docs/courier-tracking.md`.

## Verification

- Vitest: 86 tests passed, including both providers' save/edit/persistence flows, missing docket and invalid provider rejection, hostile URL rejection, customer/staff isolation, idempotent history, and no notification/invoice side effects. Existing payment, invoice, MSG91, migration, and security tests passed.
- Playwright: 17 browser tests passed, including both couriers on desktop and mobile viewports, real clipboard copying and fallback, refresh persistence, customer history, admin/staff handoff, invoice sharing/download, checkout, and access controls. These use an isolated local database and do not contact MSG91 or a payment gateway.
- Production build and TypeScript checks passed. ESLint passed with four existing image warnings in unrelated components.

The live courier migration is a separate release step; pushing the source code does not apply it automatically.
