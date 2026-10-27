# Storefront performance update — 27 October 2026

## Changes

- Public uploaded images now have responsive 320/640/960/1440-pixel versions. JPEG/PNG photos are resized and converted to WebP when this reduces their size. Original image URLs and bytes remain unchanged; animated GIFs retain their original delivery.
- Only content-hashed local uploads can use resizing. No arbitrary remote image fetching or new public image optimizer was enabled. The existing 25-megapixel upload validation remains intact; delivery supports existing legacy catalog photos up to 40 megapixels.
- A bounded 32 MB / 128-entry process cache shares concurrent source reads and resize work. Immutable image responses also allow browser/CDN caching and support ETag revalidation. Customer, admin, order, payment, and other API data retains no-store behavior.
- Product cards request the alternate image on hover/focus rather than downloading invisible previews during initial loading. The main image stays visible until its replacement is ready. The first two shop images receive loading priority, and product-detail image sizes now account for full-width mobile layouts.
- Catalog listing and category filtering use one query instead of separate category/product/rating queries. Homepage, category, and product-detail queries run independent reads concurrently. Catalog data is not cached, so prices, stock, and administrator changes remain fresh.
- Decorative videos wait for initial page loading and visibility. They pause offscreen and keep their posters on reduced-motion/data-saving connections.

## Measurements

Measured locally against the configured six-product catalog at a 390 × 844 viewport. These are local measurements, not production performance guarantees.

| Measurement | Before | After |
| --- | --- | --- |
| Initial product-image requests near the viewport | 10, including hidden hover images | 5 primary images |
| Combined transferred image bytes | 7,524,251 | 20,450 |
| Image transfer reduction | — | Approximately 99.7% |
| Warm production-build image responses, with a new browser cache | — | 7–19 ms |
| Warm production-build catalog/categories requests | — | Approximately 310 ms |

Cold-process testing still required approximately 3.5 seconds for initial database connections and 1.9–5.3 seconds for initial image reads/resizes. Subsequent server-cached requests were substantially faster. Production CDN cache-hit rates and deployment/database region latency must be measured after release; local testing does not establish those results.

## Verification

- Full automated suite: 175 tests passed across 17 files.
- Production build and TypeScript checks passed.
- ESLint: zero errors; four existing plain-image warnings remain. Uploaded images use the bounded internal responsive endpoint rather than the disabled generic Next.js optimizer.
- Twelve browser cases passed across loading/error recovery, responsive image compression and actual cache headers, deferred hover requests, reduced-motion videos, admin image persistence, product specifications, navigation, and cart behavior. The existing Windows browser harness required manual shutdown during server teardown after the test bodies passed.
- A fresh mobile browser against the optimized production build showed no runtime errors or horizontal overflow. The mobile screenshot was visually inspected.

At the pre-release verification checkpoint, no schema migration, original-image modification, product-record update, production configuration change, commit, push, or deployment had been performed for this performance work. Subsequent release status is recorded in Git history and the deployment service. The optimized production build is also available locally on port 3000 for review.
