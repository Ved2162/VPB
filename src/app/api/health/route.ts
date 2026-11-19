import { db } from "@/db";
import { sql } from "drizzle-orm";
import { rateLimitSource } from "@/lib/delivery-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try { await rateLimitSource(req, 'health', 60, 60); } catch { /* still respond */ }
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
