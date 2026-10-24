import { failPayment } from '@/lib/payment-finalization';
import { sameOrigin } from '@/lib/shipment-rules';
import { readJson } from '@/lib/http-security';
import { NextResponse } from "next/server";
import { activeUser, deliveryFailure } from '@/lib/delivery-server';

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const me = await activeUser(req);
    if (me.role === 'delivery') return NextResponse.json({ ok: false, error: 'Delivery staff cannot manage payments' }, { status: 403 });
    const body = await readJson(req);
    const { razorpay_order_id } = body;
    if (!razorpay_order_id) return NextResponse.json({ ok: true });
    if (typeof razorpay_order_id !== 'string' || razorpay_order_id.length > 80) return NextResponse.json({ ok: false, error: 'Invalid payment order' }, { status: 400 });
    await failPayment(razorpay_order_id, me.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return deliveryFailure(e);
  }
}
