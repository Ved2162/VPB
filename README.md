# VPB — Verai Patang Bhandar

A full-stack e-commerce web application for **VPB — Verai Patang Bhandar**, a premium Bareilly manjha and kite shop. Built with Next.js, PostgreSQL, Drizzle ORM, and Razorpay.

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
| Payments | Razorpay |
| Deployment | Vercel |

---

## Features

- Product catalog with categories, search, filtering, and sorting
- Product detail pages with image gallery, reviews, and pincode delivery check
- Shopping cart (localStorage-based, persisted across sessions)
- Full checkout flow with address management
- Razorpay payment integration (UPI, Cards, Net Banking)
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
│   │   │   ├── payment/      # Razorpay create/verify/webhook/retry/failed
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
│       ├── razorpay.ts       # Razorpay client + signature verification
│       ├── razorpay-client.tsx # Frontend Razorpay loader
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
- Node.js 18+
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

### 4. Push database schema

```bash
npx drizzle-kit push
```

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Seed the database (optional)

Visit `http://localhost:3000/api/seed` to populate products, categories, banners, and a default admin user.

> **Note:** In production, protect or remove the `/api/seed` endpoint after initial setup.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values. **Never commit `.env`.**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWT tokens (min 32 chars, random) |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID (from dashboard) |
| `RAZORPAY_KEY_SECRET` | Razorpay API Key Secret (server-side only) |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook secret (from dashboard) |
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
RAZORPAY_KEY_ID       = rzp_live_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET   = xxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET = your-webhook-secret
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

Click **Deploy**. Vercel will build and deploy the project.

### 5. Configure Razorpay Webhook

After deployment, set the webhook URL in your [Razorpay Dashboard](https://dashboard.razorpay.com) → Webhooks:

```
https://your-domain.vercel.app/api/payment/webhook
```

---

## Authentication

- Uses JWT tokens stored in httpOnly cookies (not accessible from JavaScript)
- Token expiry: 14 days
- Roles: `customer`, `admin`
- Admin routes protected server-side via `getUserFromHeader()` + role check
- No credentials are stored in frontend code or environment variables

---

## Payment

- Powered by **Razorpay**
- All payment amounts are calculated server-side — client amount is never trusted
- Signature verification on every payment confirmation
- Idempotent webhook handler — duplicate callbacks do not create duplicate orders
- Failed payments are recorded but orders are not fulfilled

---

## Security Notes

- All admin API routes require a valid admin JWT — returning 403 otherwise
- Customer can only access their own orders and addresses
- Password hashing: bcrypt (10 rounds)
- JWT secret must be set via environment variable — app throws at startup if missing
- `RAZORPAY_KEY_SECRET` is server-side only — never exposed to the browser
- No credentials are hardcoded in source code

---

## License

Private — Verai Patang Bhandar. All rights reserved.
