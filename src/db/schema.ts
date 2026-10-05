import { pgTable, uuid, varchar, text, integer, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";

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
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 180 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }),
  passwordHash: text("password_hash").notNull(),
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
  paymentMethod: varchar("payment_method", { length: 40 }).default("razorpay").notNull(),
  customerName: varchar("customer_name", { length: 120 }),
  customerEmail: varchar("customer_email", { length: 180 }),
  customerPhone: varchar("customer_phone", { length: 20 }),
  razorpayOrderId: varchar("razorpay_order_id", { length: 80 }).unique(),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 80 }),
  razorpaySignature: varchar("razorpay_signature", { length: 200 }),
  razorpayWebhookVerified: boolean("razorpay_webhook_verified").default(false),
  paidAt: timestamp("paid_at"),
  paymentData: jsonb("payment_data").$type<Record<string, any>>().default({}),
  cartSnapshot: jsonb("cart_snapshot").$type<Array<{ id: string; qty: number }>>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: varchar("product_name", { length: 200 }).notNull(),
  productImage: text("product_image"),
  quantity: integer("quantity").notNull(),
  price: integer("price").notNull(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  rating: integer("rating").notNull(),
  title: varchar("title", { length: 160 }),
  review: text("review"),
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
