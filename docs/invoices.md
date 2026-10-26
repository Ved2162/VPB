# Order invoices / receipts

This flow issues **basic order receipts**, as requested. It does not claim GST compliance, calculate a new tax, or print an invented GSTIN. VPB's registered tax details, HSN codes, place of supply and recorded tax allocations would need a separate verified implementation before issuing GST tax invoices. See [CBIC invoice rules](https://cbic-gst.gov.in/gst-invoice-rules.html).

## Issuance and integrity

Verified payment finalization commits the existing order, stock and WhatsApp outbox first. A separate invoice transaction then locks the order and retrieves or inserts one permanent snapshot. Invoice errors are caught, leaving the paid order and WhatsApp notification intact. The response background task retries issuance, and authenticated invoice access can retry it again.

Numbers use `VPB/YYYY-YY/NNNNNN`, with an India-time April financial-year boundary. A transactional counter row serializes different orders; the order lock and unique order key prevent duplicate issuance for refreshes, callbacks and webhooks. Numbers can exceed six digits; padding is only for display. The counter rolls back with failed issuance.

Order items, quantity, price, subtotal, shipping, discount, total, customer, delivery address, seller details and verified payment information are snapshotted from persisted records. The service refuses inconsistent totals. Existing checkout prices are rupees (Razorpay captures paise); no new tax or discount allocation is introduced. No separate billing address exists in checkout; the receipt explicitly says it uses the delivery address. Item discounts/taxes are marked as unrecorded, and the actual order discount appears in totals.

Existing eligible paid orders receive a receipt lazily on access. Pending, unverified, cancelled or refunded orders cannot issue a new receipt. An already-issued receipt remains accessible as historical evidence; the payment status is labelled as verified **at issuance**, including after a refund.

Application DB permissions are SELECT/INSERT only for snapshots and cancellation records. There is no snapshot editing endpoint. Admin can cancel a receipt with a reason and permanent actor/date record; this marks later PDFs as cancelled and does not cancel/refund the order. Reissuance with corrected financial data is deliberately unavailable. Corrections require an accounting review and a separate auditable credit/replacement process, never editing the historical snapshot.

## Migration and configuration

Run `npm run db:migrate` using `MIGRATION_DATABASE_URL` (owner) before releasing code. Migration `0004_invoices.sql` adds `invoice_counters`, `order_invoices`, `invoice_cancellations` and limited grants to the existing `vpb_app` role. It does not change existing order/payment records or backfill invoices.

Server-only optional environment settings:

- `INVOICE_SELLER_NAME`: verified business name; defaults to Verai Patang Bhandar.
- `INVOICE_SELLER_ADDRESS`: verified seller address; omit if unavailable.
- `INVOICE_SUPPORT_PHONE`: verified support phone; production uses +91 90811 11697.
- `INVOICE_SUPPORT_EMAIL`: verified support email; omit if unavailable.

Values are frozen in each invoice on issuance. Later environment updates apply only to newly issued receipts. Current production is configured with name and phone only, per the user's instruction.

PDFKit generates real PDFs server-side. The original SVG logo and bundled SIL OFL Noto Sans fonts are traced into Vercel's function package; no external image/font requests are made. Body rows wrap and paginate with repeated table headers, page numbers and A4 margins. See [PDFKit text documentation](https://pdfkit.org/docs/text.html).

## Access, download and share

`GET /api/orders/{UUID}/invoice` authenticates an active owner or admin, rejects delivery staff and other customers, rate-limits requests, issues/retrieves the snapshot, and returns an attachment with `private, no-store`. `?view=true` opens the PDF inline. Failure responses are also uncached. Neither URL nor PDF contains gateway secrets, signatures or database credentials.

Buttons appear on checkout success, customer order history and the admin order panel. PDF failures show a retry action. Shares prepare the file first, then request a second tap to retain the browser's transient user activation. Only a resolved browser share operation displays “Invoice shared.” Cancellation displays no success. Unsupported sharing offers PDF download/open and copying a login-protected link. A copied link requires the owner/admin login; arbitrary recipients should receive the PDF file. See [Web Share API requirements](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share).

## Verification

Run `npm test`, `npm run lint`, `npm run build`, then `npx playwright test`. Tests use disposable PGlite databases, not production payments or WhatsApp sends. Browser share test doubles verify supported, cancelled and unsupported branches, not actual device delivery.

Manual real-device check:

1. Log in and place an order through the configured PayU sandbox checkout. Wait for server-confirmed order success.
2. Download Invoice (PDF); compare items, shipping, discount and total with the saved order. Check seller phone, unique invoice number and ₹ glyphs.
3. Download again and from My Orders; the number and historical values must match. Confirm a second account cannot access the invoice URL.
4. On a phone supporting file sharing, tap Share Invoice to prepare, then tap again to select a sharing app. Confirm the receiving app gets the PDF. Cancel sharing once and verify no success message.
5. On an unsupported browser, copy/open the protected link or download and attach the PDF manually.
6. Open the same invoice as admin. If a cancellation is necessary, record the reason and check the cancelled PDF, unchanged order/payment and stored audit record.
7. MSG91 messaging remains independent and approval-gated; invoice availability does not imply WhatsApp delivery.
