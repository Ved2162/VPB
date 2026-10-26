import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { readFile } from 'node:fs/promises';
import * as schema from '../src/db/schema';

export async function createTestDatabase(beforeMigration?: (pg: PGlite) => Promise<void>) {
  const pg = await PGlite.create();
  await pg.exec("SET timezone = 'UTC'");
  const baseline = Object.fromEntries(Object.entries(schema).filter(([name]) => !['payuAttempts', 'inventoryReservations', 'productImages', 'invoiceCounters', 'orderInvoices', 'invoiceCancellations', 'orderNotifications', 'deliveryStaff', 'deliveryProviders', 'shipments', 'shipmentHistory', 'deliveryAudit', 'deliveryRateLimits'].includes(name)));
  const snapshot = generateDrizzleJson(baseline);
  delete snapshot.tables['public.users'].columns.username;
  delete snapshot.tables['public.users'].columns.session_version;
  for (const column of ['language', 'status', 'is_demo']) delete snapshot.tables['public.reviews'].columns[column];
  delete snapshot.tables['public.users'].uniqueConstraints.users_username_unique;
  for (const column of ['checkout_key', 'payu_txn_id', 'payu_payment_id']) delete snapshot.tables['public.orders'].columns[column];
  for (const constraint of ['orders_checkout_key_unique', 'orders_payu_txn_id_unique', 'orders_payu_payment_id_unique']) delete snapshot.tables['public.orders'].uniqueConstraints[constraint];
  const statements = await generateMigration(generateDrizzleJson({}), snapshot);
  await pg.exec(statements.join('\n'));
  await beforeMigration?.(pg);
  await pg.exec(await readFile(new URL('../migrations/0001_delivery.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0002_admin_username.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0003_order_notifications.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0004_invoices.sql', import.meta.url), 'utf8'));
    await pg.exec(await readFile(new URL('../migrations/0005_product_images.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0006_official_couriers.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0007_reviews.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0008_session_revocation.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0009_inventory_reservations.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0010_payu.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0011_payu_only_default.sql', import.meta.url), 'utf8'));
  return { pg, db: drizzle(pg) };
}
