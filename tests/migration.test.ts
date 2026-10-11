import { expect, test } from 'vitest';
import { createTestDatabase } from './database';

test('migration preserves existing orders, legacy tracking and payment data', async () => {
  const { pg } = await createTestDatabase(async pg => {
    await pg.exec(`INSERT INTO orders (order_number,subtotal,total,payment_status,order_status,courier,tracking_number,payment_data)
      VALUES ('PREEXISTING-ORDER',500,500,'paid','shipped','Legacy Courier','OLD-AWB','{"keep":"unchanged"}');`);
  });
  try {
    const { rows } = await pg.query<{ status: string; courier_name: string; docket_number: string; payment_status: string; order_status: string; payment_data: object }>('SELECT s.*, o.payment_status, o.order_status, o.payment_data FROM orders o JOIN shipments s ON s.order_id=o.id');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'NOT_ASSIGNED', courier_name: 'Legacy Courier', docket_number: 'OLD-AWB', payment_status: 'paid', order_status: 'shipped', payment_data: { keep: 'unchanged' } });
    expect((await pg.query('SELECT * FROM delivery_providers')).rows).toHaveLength(0);
    expect((await pg.query('SELECT * FROM delivery_staff')).rows).toHaveLength(0);
    await expect(pg.exec("UPDATE shipments SET status = 'INVALID'")).rejects.toThrow();
    await expect(pg.exec('INSERT INTO shipments(order_id) SELECT order_id FROM shipments')).rejects.toThrow();
  } finally { await pg.close(); }
});
