import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { payuConfig } from '@/lib/payu';
import { deliveryFailure } from '@/lib/delivery-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Readiness only: no customer data, secret values, provider calls or transactions.
export async function GET() {
  try {
    const config = payuConfig(true);
    await db.execute(sql`select checkout_key, payu_txn_id, payu_payment_id from orders limit 0`);
    await db.execute(sql`select txn_id from payu_attempts limit 0`);
    const permissions = await db.execute(sql`select
      has_table_privilege(current_user, 'payu_attempts', 'SELECT') as readable,
      has_table_privilege(current_user, 'payu_attempts', 'INSERT') as insertable,
      has_table_privilege(current_user, 'payu_attempts', 'UPDATE') as updatable`);
    if (!permissions.rows[0]?.readable || !permissions.rows[0]?.insertable || !permissions.rows[0]?.updatable)
      return Response.json({ ok: false, error: 'Payment database setup is incomplete.' }, { status: 503 });
    return Response.json({ ok: true, provider: 'payu', environment: config.environment }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return deliveryFailure(error); }
}
