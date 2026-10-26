# VPB — Verai Patang Bhandar

A full-stack e-commerce web application for **VPB — Verai Patang Bhandar**, a premium Bareilly manjha and kite shop. Built with Next.js, PostgreSQL, Drizzle ORM, and PayU (with historical transaction records).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL (Neon / any PG host) |
| ORM | Drizzle ORM |
| Authentication | JWT (httpOnly cookies) |
| Payments | PayU India Hosted Checkout; historical payment records |
| Deployment | Vercel |

---

## Features

- Server-side MSG91 WhatsApp confirmations after verified provider capture, with durable retries. See [WhatsApp setup and real-order verification](docs/whatsapp.md).
- Restricted delivery staff panel, manual courier tracking, shipment history, and admin-managed courier providers. See [Delivery operations and testing](docs/delivery.md).
- Branded kite loading, OTP feedback, and bounded API loading. See [Loading behavior](docs/loading.md).
- Security hardening and release setup are documented in [Security and production setup](docs/security.md). Review the deployment checklist before publishing.

- Product catalog with categories, search, filtering, and sorting
- Product detail pages with image gallery, reviews, and pincode delivery check
- Shopping cart (localStorage-based, persisted across sessions)
- Full checkout flow with address management
- PayU India Hosted Checkout with server verification; see [migration and approval checklist](docs/payu-migration.md)
- Order tracking by order number
- Customer dashboard (orders, addresses, profile)
- Admin dashboard (product CRUD, category management, order status, customer management)
- JWT-based authentication with role protection (customer / admin)
- Server-side pricing — frontend amount is never trusted
- Duplicate order prevention

---

## Project Structure

```
vpb/
├── src/
│   ├── app/
│   │   ├── api/              # All API routes
│   │   │   ├── auth/         # Login, register, logout
│   │   │   ├── products/     # Product listing + detail
│   │   │   ├── categories/   # Category listing
│   │   │   ├── orders/       # Order read + admin patch
│   │   │   ├── extra/        # Addresses, reviews, pincode
│   │   │   ├── admin/        # Admin CRUD (protected)
│   │   │   ├── payment/      # PayU create/retry/return/webhook/verify + retired legacy endpoints
│   │   │   ├── seed/         # Database seeder
│   │   │   └── health/       # Health check
│   │   ├── shop/             # Shop listing page
│   │   ├── product/[slug]/   # Product detail page
│   │   ├── checkout/         # Checkout flow
│   │   ├── cart/             # Cart page
│   │   ├── account/          # Customer dashboard
│   │   ├── admin/            # Admin dashboard
│   │   ├── track-order/      # Order tracking
│   │   └── ...               # Other pages
│   ├── components/
│   │   └── site.tsx          # Shared UI components (Navbar, Footer, ProductCard, etc.)
│   ├── db/
│   │   ├── index.ts          # Drizzle + pg Pool connection
│   │   └── schema.ts         # All table definitions
│   └── lib/
│       ├── auth.ts           # JWT helpers, password hashing
│       ├── store.tsx         # React context (cart, auth, toast)
│       └── data.ts           # Static constants
├── public/
│   └── images/
│       ├── manjha/           # Product images (m01.png – m11.png)
│       └── vpb-logo.svg      # Brand logo
├── drizzle.config.ts         # Drizzle Kit config (reads DATABASE_URL)
├── next.config.ts            # Next.js config
├── .env.example              # Required environment variables (no real values)
└── README.md
```

---

## Local Development Setup

### Prerequisites
- Node.js 20.9+
- PostgreSQL database (local or cloud — [Neon](https://neon.tech) recommended)

### 1. Clone the repository

```bash
git clone https://github.com/Ved2162/VPB.git
cd VPB
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in all required values (see [Environment Variables](#environment-variables) below).

### 4. Database migrations

For an existing database use the reviewed SQL migration runner (`npm run db:migrate`) with an authorized migration-owner connection. Back up first, test in staging, and obtain explicit approval before production changes. Do not use schema push to migrate existing payment records. See [PayU migration safety](docs/payu-migration.md).

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Seed the database (optional)

Seeding requires an authenticated admin POST to `/api/seed` and `ALLOW_SEED=true`. Setup only populates a completely empty catalog; if products, categories, banners or site content already exist, it skips all changes. This preserves admin edits and deletions even when a product's name, SKU and slug have all changed. Disable `ALLOW_SEED` after initial setup.

Product image uploads support file selection and drag-and-drop in the admin product editor. JPEG, PNG, WebP and GIF files up to 4 MB each are stored in PostgreSQL and served at permanent `/api/images/<content-hash>` URLs. Apply `npm run db:migrate` before deploying this feature. Uploaded images and saved product data have no automatic expiry and survive app redeployments; retain the same production `DATABASE_URL` and include `product_images` in database backups. External image URLs remain supported and depend on their external host.

---

## Environment Variables

Copy `.env.example` to `.env` and configure required values. PayU variables and safe defaults are documented in [PayU migration](docs/payu-migration.md). **Never commit `.env`.**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWT tokens (min 32 chars, random) |
| `SEED_ADMIN_EMAIL` | (Optional) Admin email for seed script |
| `SEED_ADMIN_PASSWORD` | (Optional) Admin password for seed script |

---

## Database Setup

This project uses **Drizzle ORM** with PostgreSQL.

### Push schema to database

```bash
npx drizzle-kit push
```

### Schema location

All table definitions are in `src/db/schema.ts`.

Tables: `users`, `products`, `categories`, `orders`, `order_items`, `cart_items`, `addresses`, `reviews`, `banners`, `site_content`.

---

## Production Deployment on Vercel

### 1. Connect repository to Vercel

- Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
- Select the `VPB` repository

### 2. Configure environment variables in Vercel

In the Vercel project settings → Environment Variables, add:

```
DATABASE_URL          = your-production-postgresql-url
JWT_SECRET            = your-strong-random-secret
PAYU_ENABLED=false
PAYU_ENV=test
PAYU_CURRENCY=INR
PAYU_MERCHANT_KEY=
PAYU_MERCHANT_SALT=
PAYU_BASE_URL=
```

### 3. Build settings (auto-detected)

Vercel auto-detects Next.js. No manual configuration needed.

| Setting | Value |
|---------|-------|
| Framework | Next.js |
| Build Command | `npm run build` |
| Output Directory | `.next` |
| Install Command | `npm install` |

### 4. Deploy

Deploy only after explicit approval and the PayU staging checklist. Vercel builds and deploys the approved revision.

### 5. Configure payments only after approval

Follow [PayU configuration, webhook URLs, sandbox evidence and controlled cutover](docs/payu-migration.md). Keep new checkout disabled until staging is verified. The retired gateway URLs return HTTP 410; preserve historical database records. A push to `main` can trigger Vercel deployment; approval is required before commit, push or deployment.

---

## Authentication

- Uses JWT tokens stored in httpOnly cookies (not accessible from JavaScript)
- Token expiry: 14 days
- Roles: `customer`, `admin`
- Admin routes protected server-side via `getUserFromHeader()` + role check
- Private credentials remain in server-side environment variables and are never stored in frontend code

---

## Payment

- New checkout uses **PayU India Hosted Checkout**; live activation remains approval-gated
- All payment amounts are calculated server-side — client amount is never trusted
- Reverse-hash validation and PayU server verification before payment confirmation
- Idempotent webhook handler — duplicate callbacks do not create duplicate orders
- Failed payments are recorded but orders are not fulfilled

---

## Security Notes

- All admin API routes require a valid admin JWT — returning 403 otherwise
- Customer can only access their own orders and addresses
- Password hashing: bcrypt (10 rounds)
- JWT secret must be set via environment variable — app throws at startup if missing
- `PAYU_MERCHANT_SALT` remains server-side only — never exposed to the browser
- No credentials are hardcoded in source code

---

## License

Private — Verai Patang Bhandar. All rights reserved.

## Order receipts

See [invoice setup, integrity and verification](docs/invoices.md) for PDF download/share and the invoice migration.

See [official courier tracking](docs/courier-tracking.md) for provider setup, verified link behavior, security, and testing.
