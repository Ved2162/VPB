import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromHeader } from "@/lib/auth";

const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const me = getUserFromHeader(req);

    // Query by UUID or order number — never mix them up (UUID query on a non-UUID string throws a Postgres cast error)
    const rows = isUUID(id)
      ? await db.select().from(orders).where(eq(orders.id, id))
      : await db.select().from(orders).where(eq(orders.orderNumber, id));

    if (!rows.length) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    const o = rows[0];
    if (me?.role !== "admin" && o.userId !== me?.id) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    return NextResponse.json({ ok: true, order: { ...o, items } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = getUserFromHeader(req);
    if (!me || me.role !== "admin") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
    const { id } = await params;
    const body = await req.json();
    const patch: any = { updatedAt: new Date() };
    for (const k of ["orderStatus", "paymentStatus", "trackingNumber", "courier"]) if (body[k] !== undefined) patch[k] = body[k];
    await db.update(orders).set(patch).where(eq(orders.id, id));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
