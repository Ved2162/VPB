import { sameOrigin } from '@/lib/shipment-rules';
import { readJson } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import { activeUser, deliveryFailure } from '@/lib/delivery-server';

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const me = await activeUser(req);
    if (me.role === 'delivery') return NextResponse.json({ ok: false, error: 'Delivery staff cannot manage payments' }, { status: 403 });
    const body = await readJson(req);
    const { razorpay_order_id, error } = body;
    if (!razorpay_order_id) return NextResponse.json({ ok: true });
    const o = await db.select().from(orders).where(and(eq(orders.razorpayOrderId, razorpay_order_id), eq(orders.userId, me.id)));
    if (!o.length) return NextResponse.json({ ok: true });
    if (o[0].paymentStatus !== "paid") {
      await db.update(orders).set({
        paymentStatus: "failed",
        paymentData: { ...(o[0].paymentData as any), lastError: "Checkout did not complete" },
        updatedAt: new Date(),
      }).where(and(eq(orders.id, o[0].id), notInArray(orders.paymentStatus, ["paid", "refunded"])));
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}
