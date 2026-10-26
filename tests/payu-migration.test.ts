import { test, expect } from 'vitest';
import { createTestDatabase } from './database';
import { readFile } from 'node:fs/promises';

test('additive PayU migration preserves historical Razorpay records and restricts runtime privileges', async () => {
  const database = await createTestDatabase(async pg => {
    await pg.exec("CREATE ROLE vpb_app; GRANT SELECT,INSERT,UPDATE ON orders TO vpb_app");
    await pg.exec(`INSERT INTO orders(order_number,subtotal,total,payment_status,razorpay_order_id,razorpay_payment_id,razorpay_signature,payment_data)
      VALUES('PAYU-MIGRATION-LEGACY',100,100,'paid','order_legacy_payu','pay_legacy_payu','keep-signature','{"refunds":"keep"}')`);
  });
  try {
    const query = "SELECT order_number,payment_status,razorpay_order_id,razorpay_payment_id,razorpay_signature,payment_data,payu_txn_id,payu_payment_id FROM orders";
    const before = (await database.pg.query(query)).rows;
    await database.pg.exec(await readFile(new URL('../migrations/0010_payu.sql', import.meta.url), 'utf8'));
    expect((await database.pg.query(query)).rows).toEqual(before);
    expect(before[0]).toMatchObject({ payment_status: 'paid', razorpay_order_id: 'order_legacy_payu', razorpay_payment_id: 'pay_legacy_payu', razorpay_signature: 'keep-signature', payment_data: { refunds: 'keep' }, payu_txn_id: null, payu_payment_id: null });
    expect((await database.pg.query("SELECT has_table_privilege('vpb_app','payu_attempts','SELECT,INSERT,UPDATE') AS can_work,has_table_privilege('vpb_app','payu_attempts','DELETE') AS can_delete")).rows[0]).toEqual({ can_work: true, can_delete: false });
  } finally { await database.pg.close(); }
});
