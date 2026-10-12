import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { readFile } from 'node:fs/promises';
import * as schema from '../src/db/schema';

export async function createTestDatabase(beforeMigration?: (pg: PGlite) => Promise<void>) {
  const pg = await PGlite.create();
  await pg.exec("SET timezone = 'UTC'");
  const baseline = Object.fromEntries(Object.entries(schema).filter(([name]) => !['invoiceCounters', 'orderInvoices', 'invoiceCancellations', 'orderNotifications', 'deliveryStaff', 'deliveryProviders', 'shipments', 'shipmentHistory', 'deliveryAudit', 'deliveryRateLimits'].includes(name)));
  const snapshot = generateDrizzleJson(baseline);
  delete snapshot.tables['public.users'].columns.username;
  delete snapshot.tables['public.users'].uniqueConstraints.users_username_unique;
  const statements = await generateMigration(generateDrizzleJson({}), snapshot);
  await pg.exec(statements.join('\n'));
  await beforeMigration?.(pg);
  await pg.exec(await readFile(new URL('../migrations/0001_delivery.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0002_admin_username.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0003_order_notifications.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0004_invoices.sql', import.meta.url), 'utf8'));
  return { pg, db: drizzle(pg) };
}
