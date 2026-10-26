import { pgTable, uuid, varchar, text, integer, boolean, timestamp, numeric, jsonb, index, primaryKey } from "drizzle-orm/pg-core";
import type { InvoiceSnapshot } from '@/lib/invoice-types';

// Immutable image content lives in PostgreSQL, with no expiry or local-disk dependency.
export const productImages = pgTable("product_images", {
  id: text("id").primaryKey(),
  contentType: text("content_type").notNull(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  description: text("description"),
  image: text("image"),
  active: boolean("active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 220 }).notNull().unique(),
  description: text("description"),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  brand: varchar("brand", { length: 120 }).default("VPB").notNull(),
  cordCount: integer("cord_count").default(6),
  reelCount: varchar("reel_count", { length: 40 }),
  length: varchar("length", { length: 80 }),
  price: integer("price").notNull(),
  comparePrice: integer("compare_price"),
  stockQuantity: integer("stock_quantity").default(50).notNull(),
  stockStatus: varchar("stock_status", { length: 30 }).default("in_stock").notNull(),
  sku: varchar("sku", { length: 80 }).notNull().unique(),
  featured: boolean("featured").default(false).notNull(),
  bestseller: boolean("bestseller").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  images: jsonb("images").$type<string[]>().default([]).notNull(),
  rating: numeric("rating", { precision: 3, scale: 2 }).default("4.5"),
  reviewCount: integer("review_count").default(0).notNull(),
  highlights: jsonb("highlights").$type<string[]>().default([]).notNull(),
  specs: jsonb("specs").$type<Record<string, string>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: varchar("username", { length: 80 }).unique(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 180 }),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  sessionVersion: integer("session_version").default(0).notNull(),
  role: varchar("role", { length: 20 }).default("customer").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const addresses = pgTable("addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  addressLine: text("address_line").notNull(),
  city: varchar("city", { length: 80 }).notNull(),
  state: varchar("state", { length: 80 }).notNull(),
  pincode: varchar("pincode", { length: 10 }).notNull(),
  landmark: varchar("landmark", { length: 160 }),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cartItems = pgTable("cart_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  quantity: integer("quantity").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  orderNumber: varchar("order_number", { length: 40 }).notNull().unique(),
  subtotal: integer("subtotal").notNull(),
  shippingCharge: integer("shipping_charge").default(0).notNull(),
  discount: integer("discount").default(0).notNull(),
  total: integer("total").notNull(),
  paymentStatus: varchar("payment_status", { length: 30 }).default("pending").notNull(),
  orderStatus: varchar("order_status", { length: 40 }).default("placed").notNull(),
  trackingNumber: varchar("tracking_number", { length: 80 }),
  courier: varchar("courier", { length: 80 }),
  shippingAddress: jsonb("shipping_address").$type<Record<string, string>>().default({}).notNull(),
  paymentMethod: varchar("payment_method", { length: 40 }).default("payu").notNull(),
  customerName: varchar("customer_name", { length: 120 }),
  customerEmail: varchar("customer_email", { length: 180 }),
  customerPhone: varchar("customer_phone", { length: 20 }),
  razorpayOrderId: varchar("razorpay_order_id", { length: 80 }).unique(),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 80 }),
  razorpaySignature: varchar("razorpay_signature", { length: 200 }),
  razorpayWebhookVerified: boolean("razorpay_webhook_verified").default(false),
  checkoutKey: uuid('checkout_key').unique(),
  payuTxnId: varchar('payu_txn_id', { length: 25 }).unique(),
  payuPaymentId: varchar('payu_payment_id', { length: 80 }).unique(),
  paidAt: timestamp("paid_at"),
  paymentData: jsonb("payment_data").$type<Record<string, any>>().default({}),
  cartSnapshot: jsonb("cart_snapshot").$type<Array<{ id: string; qty: number }>>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Retain every attempt, including terminal failures and delayed callbacks.
export const payuAttempts = pgTable('payu_attempts', {
  txnId: varchar('txn_id', { length: 25 }).primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  environment: varchar('environment', { length: 12 }).notNull(),
  merchantKey: text('merchant_key').notNull(),
  amount: integer('amount').notNull(), // paise, immutable
  firstname: text('firstname').notNull(),
  email: text('email').notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  paymentId: varchar('payment_id', { length: 80 }).unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  verifiedAt: timestamp('verified_at'),
}, table => [index('payu_attempts_order_idx').on(table.orderId)]);

// Short-lived checkout reservations do not alter stock until a captured payment.
export const inventoryReservations = pgTable('inventory_reservations', {
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, table => [primaryKey({ columns: [table.orderId, table.productId] }), index('inventory_reservations_product_idx').on(table.productId, table.expiresAt)]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: varchar("product_name", { length: 200 }).notNull(),
  productImage: text("product_image"),
  quantity: integer("quantity").notNull(),
  price: integer("price").notNull(),
});

// One durable confirmation per order. No recipient or message content is logged here.
export const orderNotifications = pgTable('order_notifications', {
  orderId: uuid('order_id').primaryKey().references(() => orders.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 24 }).default('pending').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow().notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  providerRequestId: varchar('provider_request_id', { length: 200 }),
  errorCode: varchar('error_code', { length: 80 }),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolution: varchar('resolution', { length: 40 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [index('order_notifications_due_idx').on(table.status, table.nextAttemptAt)]);

export const invoiceCounters = pgTable('invoice_counters', {
  financialYear: varchar('financial_year', { length: 7 }).primaryKey(),
  lastNumber: integer('last_number').notNull(),
});
export const orderInvoices = pgTable('order_invoices', {
  orderId: uuid('order_id').primaryKey().references(() => orders.id),
  invoiceNumber: varchar('invoice_number', { length: 30 }).unique().notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
  snapshot: jsonb('snapshot').$type<InvoiceSnapshot>().notNull(),
});
export const invoiceCancellations = pgTable('invoice_cancellations', {
  orderId: uuid('order_id').primaryKey().references(() => orderInvoices.orderId),
  actorId: uuid('actor_id').notNull().references(() => users.id),
  reason: varchar('reason', { length: 500 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  rating: integer("rating").notNull(),
  title: varchar("title", { length: 160 }),
  review: text("review"),
  language: varchar("language", { length: 20 }).default("en").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const banners = pgTable("banners", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  subtitle: text("subtitle"),
  image: text("image"),
  link: varchar("link", { length: 220 }),
  active: boolean("active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const siteContent = pgTable("site_content", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 80 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const otpRequests = pgTable("otp_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Normalised 10-digit phone (no country code stored — added at send time)
  phone: varchar("phone", { length: 20 }).notNull(),
  // bcrypt hash of the 6-digit OTP — never store plaintext
  otpHash: text("otp_hash").notNull(),
  // Hard expiry: 5 minutes from creation
  expiresAt: timestamp("expires_at").notNull(),
  // How many wrong guesses on this token
  attempts: integer("attempts").default(0).notNull(),
  // True once successfully verified (single-use)
  consumed: boolean("consumed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deliveryStaff = pgTable("delivery_staff", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  allOrders: boolean("all_orders").default(false).notNull(),
});

export const deliveryProviders = pgTable("delivery_providers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  trackingUrl: text("tracking_url").notNull(),
  active: boolean("active").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ShipmentSnapshot = {
  providerId: string | null; courierName: string | null; trackingUrl: string;
  docketNumber: string; status: string; internalNotes: string; assignedTo: string | null;
};

export const shipments = pgTable("shipments", {
  orderId: uuid("order_id").primaryKey().references(() => orders.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id").references(() => deliveryProviders.id),
  courierName: varchar("courier_name", { length: 80 }),
  trackingUrl: text("tracking_url").default("").notNull(),
  docketNumber: varchar("docket_number", { length: 80 }).default("").notNull(),
  status: varchar("status", { length: 30 }).default("NOT_ASSIGNED").notNull(),
  internalNotes: text("internal_notes").default("").notNull(),
  assignedTo: uuid("assigned_to").references(() => users.id),
  version: integer("version").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("shipments_assigned_idx").on(table.assignedTo), index("shipments_status_idx").on(table.status), index("shipments_provider_idx").on(table.providerId)]);

export const shipmentHistory = pgTable("shipment_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorName: varchar("actor_name", { length: 120 }).notNull(),
  before: jsonb("before").$type<ShipmentSnapshot>().notNull(),
  after: jsonb("after").$type<ShipmentSnapshot>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("shipment_history_order_idx").on(table.orderId, table.createdAt)]);

export const deliveryAudit = pgTable("delivery_audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  resource: varchar("resource", { length: 30 }).notNull(),
  resourceId: uuid("resource_id").notNull(),
  changes: jsonb("changes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deliveryRateLimits = pgTable("delivery_rate_limits", {
  key: varchar("key", { length: 100 }).primaryKey(),
  count: integer("count").default(1).notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
