// Disposable local database: never reads .env and never connects to the live database.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import bcrypt from 'bcryptjs';
import next from 'next';

const pg = await PGlite.create();
await pg.exec("SET timezone = 'UTC'");
const source = await readFile(new URL('../src/db/schema.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const schema = {};
new Function('require', 'exports', compiled)(createRequire(import.meta.url), schema);
const baseline = Object.fromEntries(Object.entries(schema).filter(([name]) => !['invoiceCounters', 'orderInvoices', 'invoiceCancellations', 'orderNotifications', 'deliveryStaff', 'deliveryProviders', 'shipments', 'shipmentHistory', 'deliveryAudit', 'deliveryRateLimits'].includes(name)));
const snapshot = generateDrizzleJson(baseline);
  delete snapshot.tables['public.users'].columns.username;
  delete snapshot.tables['public.users'].uniqueConstraints.users_username_unique;
await pg.exec((await generateMigration(generateDrizzleJson({}), snapshot)).join('\n'));
await pg.exec(await readFile(new URL('../migrations/0001_delivery.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0002_admin_username.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0003_order_notifications.sql', import.meta.url), 'utf8'));
  await pg.exec(await readFile(new URL('../migrations/0004_invoices.sql', import.meta.url), 'utf8'));
const passwordHash = await bcrypt.hash('E2e-only-password-2026', 10);
await pg.query("INSERT INTO users (id,name,phone,password_hash,role) VALUES ('00000000-0000-4000-8000-000000000001','E2E Admin','9000000101',$1,'admin'), ('00000000-0000-4000-8000-000000000002','E2E Customer','9000000102',$1,'customer'), ('00000000-0000-4000-8000-000000000003','Other Customer','9000000103',$1,'customer')", [passwordHash]);
await pg.exec("UPDATE users SET username='e2eadmin' WHERE role='admin'");
// Only the disposable test database receives this known OTP; no SMS or live account is touched.
await pg.query("INSERT INTO otp_requests(phone,otp_hash,expires_at) VALUES('9000000102',$1,now()+interval '10 minutes')", [await bcrypt.hash('654321', 4)]);
await pg.exec(`INSERT INTO orders (id,user_id,order_number,subtotal,total,payment_status,customer_name,customer_phone,shipping_address,created_at)
  SELECT ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, '00000000-0000-4000-8000-000000000002', 'E2E-' || lpad(n::text,3,'0'), 100, 100, 'paid', 'E2E Customer', '9000000102', '{"name":"E2E Customer","addressLine":"Test delivery street","city":"Bareilly","state":"Uttar Pradesh","pincode":"243001"}'::jsonb, now() - n * interval '1 hour' FROM generate_series(1,23) n;
  INSERT INTO order_items (order_id,product_name,quantity,price) SELECT id,'Cotton manjha',2,50 FROM orders;`);
await pg.exec("UPDATE orders SET order_status='confirmed', paid_at=created_at, razorpay_payment_id='pay_e2e_' || order_number");
await pg.exec(`INSERT INTO products (id,name,slug,sku,price,stock_quantity,images) VALUES ('20000000-0000-4000-8000-000000000001','Loader test kite','loader-test-kite','LOADER-KITE',100,25,'["/images/manjha/m01.png"]');
INSERT INTO addresses(user_id,name,phone,address_line,city,state,pincode,is_default) VALUES('00000000-0000-4000-8000-000000000002','E2E Customer','9000000102','Test street','Bareilly','Uttar Pradesh','243001',true);`);
const socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 54329, maxConnections: 20 });
await socket.start();
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54329/postgres';
process.env.JWT_SECRET = 'isolated-browser-test-secret-not-a-production-credential';
process.env.NEXT_OUTPUT_DIR = '.next';
process.env.RAZORPAY_KEY_ID = '';
process.env.RAZORPAY_KEY_SECRET = '';
process.env.RAZORPAY_WEBHOOK_SECRET = '';
process.env.RENFLAIR_API_KEY = '';
const app = next({ dev: false, hostname: '127.0.0.1', port: 3100 });
await app.prepare();
const handler = app.getRequestHandler();
const server = createServer((req, res) => handler(req, res));
server.listen(3100, '127.0.0.1', () => console.log('Isolated E2E app ready: http://127.0.0.1:3100'));
async function stop() { const deadline = setTimeout(() => process.exit(0), 3000); deadline.unref(); server.closeAllConnections(); server.close(); await socket.stop(); await app.close(); await pg.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
