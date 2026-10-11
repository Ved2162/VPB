# VPB loading system

`src/components/loading.tsx` provides the shared circular VPB loader, section and button feedback, product/table skeletons, errors with retry, and native Next link pending indicators. App Router `loading.tsx` and `error.tsx` handle route suspense and failures.

Browser API calls use `apiFetch` with an independent activity token per request. Tokens remain active through response-body reading and always settle in `finally`. Requests time out after 20 seconds; network and malformed-response errors follow the existing JSON error contract. Explicit caller cancellation remains an abort. `useApiResource` cancels stale reads and supports retained data during refreshes.

Visual loading indicators wait 180 milliseconds before appearing. Local cart calculations remain synchronous. Full page suspense is reserved for blocking route loading; section and action feedback leave surrounding content usable. Initial authentication and blocking route suspense share a single token-managed viewport overlay. It appears after 180 ms, centers the stable serif VPB text inside a rotating burgundy/gold ring, and uses a theme-aware translucent surface with 4 px backdrop blur. Background elements become inert, scrolling is locked, and focus is contained until cleanup restores interaction. The blocking route fallback stops its animation and offers recovery after 30 seconds. CSS supports light/dark themes and reduced motion. API activity is announced accessibly without a second visible request banner.

The OTP phone/envelope, six masked code slots, and verified check follow the [OTP screen reference](https://www.svgator.com/animation-templates#a5bf1e3610864d4998b70c06cada02a4) using VPB burgundy, cream and gold. These are local CSS/SVG components with no third-party animation runtime. Code dots reflect actual entered digits; a verified check requires a successful backend response.

Validation: `npm test`, `npm run test:e2e`, and `npm run build`. Browser tests use a disposable local PGlite database, real application routes, and request interception to check slow/failing/fast requests. No live orders, customers, products, or payments are changed by the loader tests.
