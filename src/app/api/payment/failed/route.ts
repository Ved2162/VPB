import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { razorpay_order_id, error } = body;
    if (!razorpay_order_id) return NextResponse.json({ ok: true });
    const o = await db.select().from(orders).where(eq(orders.razorpayOrderId, razorpay_order_id));
    if (!o.length) return NextResponse.json({ ok: true });
    if (o[0].paymentStatus !== "paid") {
      await db.update(orders).set({
        paymentStatus: "failed",
        paymentData: { ...(o[0].paymentData as any), lastError: error || {} },
        updatedAt: new Date(),
      }).where(eq(orders.id, o[0].id));
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
