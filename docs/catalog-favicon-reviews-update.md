# VPB catalog, customer reviews and media update

## Customer-facing changes

- Public shopping focuses on manjha. Legacy kite products are excluded from catalog results, category navigation, product details, recommendations and new checkout creation without deleting product records or historical orders.
- Header metadata includes favicon.ico, 16px/32px PNG icons and an Apple touch icon. The original logo attachment is retained in assets/vpb-logo-original.jpg; the favicon master is the image tool extraction created during the initial update.
- The homepage scrolling strip lists VAYUSHASTRA Sankal 8, VAYUSHASTRA PANDA 5, THE ROCK BREAKER, Sankal 8, THE ROCK BREAKER, PANDA 5, Pan-India Shipping and Tournament Grade.
- Original homepage and Craftsmanship video sources remain intact. About VPB and Craftsmanship use the supplied workshop photographs. The homepage brand story pairs the paste-coating and red-reel images; the ritual section shows cotton preparation. The six-image Instagram gallery combines the latest craft images with earlier workshop photos.
- Original photographs are retained under assets; optimized WebP versions are served from public/images/craft and public/images/workshop. Rebuild those files with scripts/prepare-craft-images.mjs and scripts/prepare-workshop-images.mjs.

## Review integrity and migration

The existing review system supports English, Roman Hindi and Roman Gujarati. Authenticated submissions require a valid integer rating, bounded nonempty review text and supported language. Rate limits remain in place and duplicate product/user submissions are rejected. The admin Reviews tab can approve, reject or hold reviews.

Public ratings and counts derive from approved, non-demo reviews only. A verified-purchase badge requires a matching paid, non-cancelled order item. Empty states replace unsupported rating claims. Six expandable examples are explicitly labeled samples, have no fabricated identities or dates, and never contribute to ratings. Review text is escaped by React.

Apply npm run db:migrate before release. Migration 0007_reviews.sql adds language, moderation status, demo metadata and a public-query index; it preserves all review records, placing legacy feedback in the moderation queue. The migration was applied to the configured database during local implementation.

## Validation

- 89 Vitest cases cover existing integrations and the added catalog/review behavior.
- Type checking and production build passed during implementation. ESLint reports four existing image optimization warnings and no errors.
- Four selected browser regression cases passed for product image editing, authentication/OTP behavior, protected requests and payment retry. The disposable server needed manual shutdown afterward.
- Local Chromium verified the six gallery images, both brand-story images and ritual image, HTTP 200 for local assets, desktop/mobile layout without horizontal overflow, correct favicon metadata, the manjha cart flow and expected checkout login redirect. No browser runtime errors were observed.
- Both original external video URLs returned HTTP 200 with video/mp4. No live payment, SMS or WhatsApp transaction was sent.

The build tool reports an existing Next.js 16.4.0 security advisory. Dependency upgrades are outside this content update.
