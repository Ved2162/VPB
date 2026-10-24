import { expect, test } from 'vitest';
import { createTestDatabase } from './database';

test('security migrations preserve legacy rows and grant only reservation DML to the runtime role', async () => {
  const { pg } = await createTestDatabase(async pg => {
    await pg.exec("CREATE ROLE vpb_app; INSERT INTO users(name,phone,password_hash) VALUES('Legacy fixture','9800000001','fixture-only'); INSERT INTO orders(order_number,subtotal,total) VALUES('LEGACY-SECURITY-MIGRATION',100,100);");
  });
  try {
    expect((await pg.query('SELECT session_version FROM users')).rows).toEqual([{ session_version: 0 }]);
    expect((await pg.query("SELECT count(*)::int AS n FROM orders WHERE order_number='LEGACY-SECURITY-MIGRATION'")).rows).toEqual([{ n: 1 }]);
    expect((await pg.query('SELECT count(*)::int AS n FROM inventory_reservations')).rows).toEqual([{ n: 0 }]);
    const role = (await pg.query("SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname='vpb_app'")).rows[0];
    expect(role).toEqual({ rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false });
    expect((await pg.query("SELECT has_table_privilege('vpb_app','inventory_reservations','SELECT,INSERT,UPDATE,DELETE') AS reservations, has_table_privilege('vpb_app','order_invoices','UPDATE') AS rewrite_receipts")).rows[0]).toEqual({ reservations: true, rewrite_receipts: false });
    await pg.exec('SET ROLE vpb_app');
    await expect(pg.exec('ALTER TABLE users ADD COLUMN fixture_bad integer')).rejects.toThrow();
    await pg.exec('RESET ROLE');
  } finally { await pg.close(); }
});
