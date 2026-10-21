// Read-only check of the configured runtime database. Never prints credentials or customer records.
import 'dotenv/config';
import pg from 'pg';
const connection = new URL(process.env.DATABASE_URL);
if (connection.hostname.endsWith('neon.tech')) connection.searchParams.set('sslmode', 'verify-full');
const pool = new pg.Pool({ connectionString: connection.toString(), connectionTimeoutMillis: 10000, query_timeout: 10000 });
try {
  const requirements = {
    products: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    categories: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    users: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    orders: ['SELECT', 'UPDATE'],
    banners: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    site_content: ['SELECT', 'INSERT', 'UPDATE'],
    delivery_providers: ['SELECT', 'INSERT', 'UPDATE'],
    delivery_staff: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    shipments: ['SELECT', 'INSERT', 'UPDATE'],
    shipment_status_history: ['SELECT', 'INSERT'],
    delivery_audit: ['SELECT', 'INSERT'],
    product_images: ['SELECT', 'INSERT'],
  };
  const access = [];
  for (const [table, operations] of Object.entries(requirements)) {
    const { rows } = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [table]);
    const missing = [];
    if (rows[0].exists) {
      for (const operation of operations) {
        const result = await pool.query('SELECT has_table_privilege(current_user, $1, $2) AS allowed', [table, operation]);
        if (!result.rows[0].allowed) missing.push(operation);
      }
    }
    access.push({ table, exists: rows[0].exists, missing });
  }
  console.log(JSON.stringify({ databaseConnected: true, adminTableAccess: access }, null, 2));
  if (access.some(item => !item.exists || item.missing.length)) process.exitCode = 1;
} catch (error) { console.error('Database permission check failed:', error.code || 'configuration/network failure'); process.exitCode = 1; }
finally { await pool.end(); }
