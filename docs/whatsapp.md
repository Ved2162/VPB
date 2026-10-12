# MSG91 WhatsApp order confirmations

## Architecture

The existing Next.js/Drizzle/PostgreSQL checkout and Razorpay verification remain in place. Payment initiation saves a pending order using database prices and the active authenticated user's registered phone. It does **not** send confirmation. Signed checkout verification fetches captured payment state from Razorpay; signed capture webhooks also use `finalizePayment`.

Finalization atomically inserts one `order_notifications` row with the verified paid order. Only a newly confirmed payment queues a notification; there is no historical backfill. Duplicate verification/webhooks cannot queue another row. After commit, Next.js `after()` processes the row without delaying the HTTP response. A scheduler recovers pending rows if the response task is interrupted. Notification retries never create orders or rerun payment finalization.

The worker atomically claims a row across concurrent instances, then checks persisted payment/order state and the registered phone snapshot. For the supplied approved template, it sends exactly the stored customer name, public order number and server-verified total, in that order. The amount is numeric because the fixed template already includes the rupee symbol. The confirmation sentence and delivery estimate remain the template's static text. No order date, payment status or extra message text is appended.

Missing/invalid Indian mobile numbers are skipped; delivery-address numbers are not used as an unverified fallback. Ten-digit mobile numbers, `91`/`+91` prefixes and domestic leading zero are supported, with common separators. Output is `91` followed by ten digits, without `+`.

## Deployment

1. Rotate the credential shared in chat. Put the replacement in the Vercel project's Settings > Environment Variables as `MSG91_AUTH_KEY`, scoped to the intended deployment environment, then redeploy. Keep it server-side; do not paste the key into documentation, source code or browser requests. Never use `NEXT_PUBLIC_`. No credential has been written to the repository.
2. Back up the database and run `npm run db:migrate`, using `MIGRATION_DATABASE_URL` (owner) or existing `DATABASE_URL`. Migration `0003_order_notifications.sql` adds the outbox, unique order key, state constraints and due-work index. Existing order/payment data is preserved. Apply before deploying the app. The migration grants SELECT/INSERT/UPDATE to the existing `vpb_app` role when present. For a differently named runtime role, grant those permissions to that role; do not grant public access.
3. Configure the **actual** integrated MSG91 sender and approved **Utility** template below. Check approval, category, sync and enabled status in MSG91. No approval or account configuration has been inferred from the supplied key.

| Variable | Required value |
| --- | --- |
| `MSG91_WHATSAPP_ENABLED` | `true` only after setup; disabled by default |
| `MSG91_AUTH_KEY` | Rotated server credential |
| `MSG91_WHATSAPP_NUMBER` | Integrated sender, digits with country code |
| `MSG91_TEMPLATE_NAME` | Exact approved Utility template name |
| `MSG91_TEMPLATE_LANGUAGE` | Exact template language code |
| `MSG91_TEMPLATE_NAMESPACE` | Literal `null` for the supplied MSG91 request; serialized as JSON null, not a string |
| `MSG91_TEMPLATE_BODY_VARIABLES` | Comma-separated field names in exact approved body-variable order |
| `MSG91_TEMPLATE_AMOUNT_FORMAT` | `number` if the template already contains a currency symbol; otherwise `currency` (default) |
| `CRON_SECRET` | Separate random secret of at least 32 characters |

For this approved template set `MSG91_TEMPLATE_BODY_VARIABLES=customer_name,order_id,total_amount` and `MSG91_TEMPLATE_AMOUNT_FORMAT=number`. Send exactly three body parameters: `body_1` = customer name, `body_2` = order ID, `body_3` = order amount. The user explicitly confirmed that the existing approved Utility template must be used without an order-date placeholder. Do not add a fourth variable or alter the approved text. The generic adapter also supports other field mappings, but those are not used for this template.

The user supplied MSG91's generated API cURL with `"namespace": null`. Set `MSG91_TEMPLATE_NAMESPACE=null` (the four letters `null`) in Vercel. The adapter converts this to JSON null; it does not send the string `"null"`. An empty/unset variable still blocks sending, so incomplete configuration is never silently inferred. No namespace needs to be invented or requested for this supplied template.

For future changes, go to MSG91 > WhatsApp > Templates and select the template's **code** option ([official instructions](https://msg91.com/help/whatsapp/how-to-create-a-template-for-whatsapp)). Match `payload.template.name`, `payload.template.language.code`, `payload.template.namespace` and `integrated_number` to its generated request.

4. `vercel.json` schedules `GET /api/internal/whatsapp` daily at 03:00 UTC (08:30 India time), compatible with the connected Hobby plan. Hobby scheduling may run within that hour. Set a random `CRON_SECRET` of at least 32 characters in Vercel; Vercel supplies it as the bearer credential. Normal sends still run immediately using Next.js `after()`; the daily cron recovers interrupted work and retries rate-limit failures. This is a daily recovery cadence, not a one-minute retry guarantee. On a plan supporting it, change to `* * * * *`, or use an authorized external scheduler with `Authorization: Bearer <CRON_SECRET>` for faster recovery. The route allows 120 seconds and processes up to five rows per invocation, each with a ten-second API timeout. Monitor oldest pending age and failed/unknown counts; increase recovery capacity for higher volumes. Never put the secret in a URL or browser request.
5. Restart/redeploy after configuring. Missing/invalid configuration returns `configured: false` and leaves rows pending. Enabling later processes orders queued since this release, so review the backlog before enabling after a prolonged outage.

## Status and retries

An active admin session can read `GET /api/admin/notifications?orderId=<database-order-uuid>`, or omit the filter for the latest 100 rows. Logs include only order UUID, state and fixed error code; never credentials, phone, address, message content or raw provider responses.

| State | Meaning |
| --- | --- |
| `pending` | Waiting for worker/configuration |
| `sending` | Durably claimed before HTTP request |
| `accepted` | Recognized MSG91 success with request ID; **not delivery** |
| `retry` | HTTP 429; exponential delay, at most five attempts |
| `failed` | Explicit HTTP 400/401/403/404/422 rejection or exhausted rate limits |
| `skipped` | Invalid recipient or order no longer eligible |
| `unknown` | Timeout/network failure, HTTP 5xx/ambiguous response, unrecognized success, or sending longer than five minutes |

Fix the configuration/quota or trusted recipient data first. While logged in as admin, POST JSON on the same origin to `/api/admin/notifications`:

```json
{ "orderId": "<database-order-uuid>", "action": "retry" }
```

This only requeues failed/skipped rows. Accepted/active rows cannot be resent. The API cannot override recipient/order data and never reports delivery.

For unknown rows, inspect MSG91 logs/support using `CRQID = vpb-order-<database-order-uuid>`, request ID if available and attempt time. CRQID is correlation metadata, **not a documented provider idempotency key**. Only after definitive provider confirmation of non-acceptance use `action: "confirmed_not_accepted"`. For confirmed acceptance use `action: "confirmed_accepted"` plus `providerRequestId: "<actual-request-id>"`; this records acceptance without sending again. Admin ID and resolution are stored. A missing log entry alone is not proof of non-acceptance. If uncertain, leave unknown and contact MSG91.

Exactly-once delivery cannot be guaranteed across a database and third-party HTTP without provider idempotency. This implementation prevents automatic duplicate submissions and quarantines ambiguous outcomes. A provider acceptance followed by a database-write failure becomes stale/unknown for reconciliation. No unauthenticated delivery webhook is added; verify delivery in MSG91's dashboard.

## Real test order

1. Apply migration, configure the actual approved template and rotated key, enable sending and schedule the worker. Use staging and a registered account with a WhatsApp number you control. Razorpay test capture is suitable where supported; MSG91 sends are real and may be charged.
2. Submit a normal checkout. While payment is pending/authorized, verify no notification row/message appears. Fail/cancel a separate payment and verify no confirmation.
3. Complete capture. Verify paid/confirmed order state and exactly one notification row. Check recipient/name/order ID/total against stored order data and verify that exactly the three approved body variables are present.
4. Verify `accepted` and `provider_request_id`. Match the request/CRQID in MSG91 and check **Delivered** or Read, then inspect the actual phone message and variable order. If unknown, inspect the actual response contract in MSG91 before retrying. Acceptance alone does not prove delivery.
5. Replay the same valid checkout verification/signed captured webhook, and invoke workers concurrently. Verify one row, unchanged attempts after acceptance and one provider submission/message.
6. On a separate staging order, test an invalid MSG91 key: the order remains paid and notification fails. Restore the key, use the admin retry, and verify the same order is retained. Test a missing/invalid registered number in disposable data: it should skip without contacting MSG91.
7. Reconcile unknown/interrupted outcomes as above; do not deliberately create ambiguous real sends to customers to test retry behavior.

## Automated checks and references

`npm test` uses isolated PGlite databases and explicit transport doubles. These tests do not contact MSG91 and are not evidence of live acceptance/delivery. They cover payment state, failed finalization, duplicates/concurrency, missing phone/configuration, rejection, timeout/5xx/unrecognized response, bounded rate limits, admin authorization, reconciliation and interrupted workers. Also run `npm run typecheck`, `npm run build`, and `npm run security:secrets`.

Official references: [WhatsApp](https://docs.msg91.com/whatsapp), [template API](https://docs.msg91.com/whatsapp/template-bulk), [payload example](https://msg91.com/help/whatsapp/whatsapp-otp), [CRQID](https://msg91.com/help/whatsapp/how-to-pass-crqid-in-whatsapp-), [delivery reports](https://msg91.com/help/whatsapp/how-to-get-reports-of-whatsapp-messages-on-webhook). The payload example documents the shared transport; use your approved Utility template, not its authentication example.

## Supplied VPB template configuration

The user supplied a three-variable template, its language and an integrated sender. Those account-specific settings are stored only in the local ignored `.env`, with this mapping:

- `MSG91_TEMPLATE_BODY_VARIABLES=customer_name,order_id,total_amount`
- `MSG91_TEMPLATE_NAMESPACE=null` matches the supplied MSG91-generated request.
- `MSG91_TEMPLATE_AMOUNT_FORMAT=number` because the fixed body already includes the rupee symbol.
- `MSG91_WHATSAPP_ENABLED=false` pending completion of setup.

The supplied body contains a static confirmation sentence and a 5-to-7-day delivery estimate. Exactly three variables are sent; no fourth date variable or payment-status text is appended. The user confirmed Utility approval and explicitly instructed use of this existing template without an order date; this supersedes the original date requirement. The supplied MSG91-generated request confirms a null namespace; local configuration now matches it explicitly. Template name, sender and language also match that request. The supplied template text and delivery estimate are user-provided, not independently verified. No credential has been copied into repository files; production credentials are configured only in Vercel server environment variables. No real message has been sent during automated verification.
