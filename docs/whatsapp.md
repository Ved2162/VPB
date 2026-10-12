# MSG91 WhatsApp order confirmations

## Architecture

The existing Next.js/Drizzle/PostgreSQL checkout and Razorpay verification remain in place. Payment initiation saves a pending order using database prices and the active authenticated user's registered phone. It does **not** send confirmation. Signed checkout verification fetches captured payment state from Razorpay; signed capture webhooks also use `finalizePayment`.

Finalization atomically inserts one `order_notifications` row with the verified paid order. Only a newly confirmed payment queues a notification; there is no historical backfill. Duplicate verification/webhooks cannot queue another row. After commit, Next.js `after()` processes the row without delaying the HTTP response. A scheduler recovers pending rows if the response task is interrupted. Notification retries never create orders or rerun payment finalization.

The worker atomically claims a row across concurrent instances, then checks persisted payment/order state and the registered phone snapshot. For the latest supplied template, it sends exactly the stored customer name and public order number, in that order. The template's fixed text says the order is being prepared and the customer will be notified when it is on the way. This integration sends the order confirmation only; that sentence does not implement a separate dispatch notification. No order date, payment status or extra message text is appended.

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
| `MSG91_TEMPLATE_NAMESPACE` | Exact namespace from the latest generated MSG91 request, stored server-side in Vercel |
| `MSG91_TEMPLATE_BODY_VARIABLES` | Comma-separated field names in exact approved body-variable order |
| `MSG91_TEMPLATE_AMOUNT_FORMAT` | `number` if the template already contains a currency symbol; otherwise `currency` (default) |
| `CRON_SECRET` | Separate random secret of at least 32 characters |

For the current template, set `MSG91_TEMPLATE_BODY_VARIABLES=customer_name,order_id`. Send exactly two body parameters: `body_1` = customer name and `body_2` = public order ID. The user supplied the actual text: `Hi {{1}}, We're getting your order {{2}} ready and will let you know when it's on the way.` Do not append amount, date, payment status or a third variable. The adapter requires an explicit non-empty mapping of supported server fields; it does not infer the mapping from the number of placeholders.

The latest MSG91-generated API request supplies a real namespace. Copy that exact string into `MSG91_TEMPLATE_NAMESPACE` in Vercel and redeploy; do not retain the `null` value from the earlier generated example. The adapter preserves a supplied namespace verbatim. It also supports explicit `null` for templates whose current generated request actually requires JSON null, but that is no longer the supplied template's configuration. Empty/unset configuration still blocks sending.

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

Exactly-once delivery cannot be guaranteed across a database and third-party HTTP without provider idempotency. This implementation prevents automatic duplicate submissions and quarantines ambiguous outcomes. A provider acceptance followed by a database-write failure becomes stale/unknown for reconciliation. No unauthenticated delivery webhook is added. A protected read-only diagnostic mode can retrieve final delivery reports through MSG91's official API; dashboard verification remains available.

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

## Current VPB template configuration

The latest user-supplied template has exactly two variables, mapped to customer name and public order number. The actual account-specific template name, sender, language and namespace are stored in server environment settings only. Vercel production configuration has been updated to the latest supplied template with `MSG91_TEMPLATE_BODY_VARIABLES=customer_name,order_id`. Local sending remains disabled unless explicitly enabled for a real test.

The previous three-variable template was rejected in MSG91 delivery logs even though the API initially accepted the submission. Changing template configuration does not resend those accepted-but-failed historical rows. Reconcile them against MSG91's final failure report before an explicitly authorized retry. Never create another order to retry a notification. Template approval and live delivery must be verified with MSG91; a successful build or API request does not establish delivery.

## Controlled production checks

An explicitly authorized controlled notification test can limit the authenticated worker to one order with `GET /api/internal/whatsapp?orderId=<database-order-uuid>` and its normal scheduler bearer credential. UUID validation and the same payment/recipient/idempotency checks apply. Other pending notifications are not sent by a targeted invocation. An accepted or unknown row is never automatically requeued for testing; reconcile against MSG91's final failed-delivery report first. Razorpay test mode does not make MSG91 sends simulated: provider acceptance and actual delivery still require separate verification.

## Verified template-lookup investigation (12 October 2026)

Trace: checkout creates the local pending order using database prices and the authenticated profile; verified Razorpay capture finalizes it and queues one notification atomically; Next.js after-response work or cron processes that durable row; the server reads its registered recipient and persisted order fields; the MSG91 v5 bulk template POST is submitted only after template approval/schema preflight passes.

The official Get Templates API returned the configured template in language `en`, with matching namespace, Utility category, positional text variables `body_1` and `body_2`, `is_disabled=0`, but approval **status `pending`**. The two previous templates were also pending. MSG91's UI Enabled flag is different from this approval state. The official delivery report confirmed template-not-found failure with null sent/delivery timestamps. No successfully delivered message has been verified.

The send endpoint remains `https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/`, matching the account-generated cURL. The public reference also documents the `control.msg91.com` host for this v5 route. The request envelope, deterministic language policy, namespace and text body component structure match the supplied/generated contract. The backend does not submit a template ID in place of its name. The latest user error text used `order_confirm`; live configuration and the retrieved inventory use the user-supplied `order_conform`. No speculative spelling or locale change was made.

Documented read-only APIs:

- GET `https://control.msg91.com/api/v5/whatsapp/get-template-client/:number?template_name=...`
- GET `https://control.msg91.com/api/v5/report/logs/wa?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&requestId=...&fields=...`

Preflight checks approval, exact template/language/namespace, disabled state and the supported variable types/count before claiming a notification. Pending/invalid lookup leaves it queued with a fixed diagnostic code and a five-minute not-before time. It does not consume send attempts. The existing Hobby recovery schedule is daily; faster automatic recovery still requires a supported scheduler cadence. No approval is inferred from Enabled.

For an authorized operator, GET `/api/internal/whatsapp?diagnose=true&orderId=<database-order-uuid>` with the existing scheduler bearer credential returns sanitized template status and the order's recorded request's final delivery report. This mode sends nothing and changes no order/notification state. The provider report query explicitly excludes recipient and message-content fields.

Server logs include the sanitized outgoing request structure, endpoint/version, variable mapping, HTTP response code and complete structured response with secret/customer fields redacted. Free-text errors also redact known recipient/name/variable values, phone-like strings and emails. Requests never log auth headers. Oversized responses are bounded and identified instead of dumped. Nested diagnostics are JSON-serialized so error details are not reduced to `[Object]`.

Get the existing template approved in Meta/MSG91; do not create duplicates or change code to bypass approval. Once the API reports approved, run one authorized test using a reconciled failed notification or a new test checkout, then confirm a `delivered`/`read` report. API acceptance alone cannot mark this integration fixed. Templates approved after earlier failed sends do not automatically make those historical attempts delivered.
