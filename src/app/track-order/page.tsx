"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PackageCheck, Truck, Check } from "lucide-react";
import { money, ORDER_STEPS, ORDER_LABEL } from "@/lib/data";
import { SafeImg } from "@/components/site";

function TrackInner() {
  const sp = useSearchParams();
  const [num, setNum] = useState(sp.get("num") || "");
  const [order, setOrder] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const track = async () => {
    setErr(""); setOrder(null);
    if (!num.trim()) { setErr("Enter order number (e.g. VPB-2026-XXXX)"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/orders/" + encodeURIComponent(num.trim()));
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Order not found");
      setOrder(j.order);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const cur = order ? ORDER_STEPS.indexOf(order.orderStatus) : -1;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-center text-[12px] font-bold uppercase tracking-[0.28em] text-[#7a1f1f]">VPB Tracking</p>
      <h1 className="mt-1 text-center font-serif text-3xl font-bold">Track Your Order</h1>
      <div className="card mt-6 flex gap-2 p-3">
        <input value={num} onChange={(e) => setNum(e.target.value)} onKeyDown={(e) => e.key === "Enter" && track()} placeholder="Enter order number — VPB-2026-XXXX" className="input !border-0 !bg-transparent" />
        <button onClick={track} disabled={busy} className="btn-primary shrink-0 disabled:opacity-60">{busy ? "Tracking…" : "Track"}</button>
      </div>
      {err && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-center text-sm font-semibold text-red-700">{err} — check the number on your confirmation screen or account page.</p>}

      {order && (
        <div className="card mt-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-serif text-xl font-bold">{order.orderNumber}</p>
              <p className="text-sm text-stone-500">Placed {new Date(order.createdAt).toLocaleString("en-IN")} • {order.courier} • {order.trackingNumber}</p></div>
            <span className="pill bg-[#fff4de] text-[#7a5b1e] !text-[13px] !px-4 !py-1.5">{ORDER_LABEL[order.orderStatus] || order.orderStatus}</span>
          </div>

          <div className="relative mt-8 pl-1">
            <div className="track-line" />
            <div className="space-y-5">
              {ORDER_STEPS.map((s, i) => {
                const done = i <= cur;
                const isCur = i === cur;
                return (
                  <div key={s} className="relative flex gap-4 pl-10">
                    <span className={`absolute left-2.5 grid h-9 w-9 place-items-center rounded-full border-2 ${done ? "border-[#7a1f1f] bg-[#7a1f1f] text-white" : "border-[#e7d6b8] bg-white text-stone-300"}`}>
                      {done ? (i === ORDER_STEPS.length - 1 ? <PackageCheck size={16} /> : <Check size={16} />) : <Truck size={15} />}
                    </span>
                    <div className={done ? "" : "opacity-45"}>
                      <p className={`font-bold ${isCur ? "text-[#7a1f1f]" : ""}`}>{ORDER_LABEL[s]} {isCur && <span className="pill ml-2 bg-[#7a1f1f] text-white">Current</span>}</p>
                      <p className="text-xs text-stone-500">{isCur ? "Updated by VPB team — " + new Date(order.updatedAt).toLocaleString("en-IN") : done ? "Completed" : "Pending"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 border-t border-dashed border-[#e7d6b8] pt-5">
            <p className="font-serif text-lg font-bold">Items ({order.items?.length})</p>
            <div className="mt-3 space-y-2">
              {(order.items || []).map((it: any) => (
                <div key={it.id} className="flex items-center gap-3 text-sm">
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#f6ead2]"><SafeImg src={it.productImage} alt={it.productName} sizes="48px" className="object-cover" /></span>
                  <span className="flex-1 font-semibold">{it.productName} × {it.quantity}</span><b>{money(it.price * it.quantity)}</b>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between font-serif text-xl font-black"><span>Total</span><span className="text-[#7a1f1f]">{money(order.total)}</span></div>
            <p className="mt-2 text-sm text-stone-500">Deliver to: {(order.shippingAddress as any)?.name}, {(order.shippingAddress as any)?.addressLine}, {(order.shippingAddress as any)?.city} — {(order.shippingAddress as any)?.pincode}</p>
          </div>
        </div>
      )}

      {!order && !err && (
        <div className="mt-6 rounded-2xl bg-[#fff6e3] p-5 text-center text-sm text-[#7a5b1e]">Tip: find your order number in <b>My Account → Orders</b> or on the checkout confirmation screen.</div>
      )}
    </div>
  );
}
export default function TrackPage() {
  return <Suspense fallback={<div className="p-10 text-center">Loading…</div>}><TrackInner /></Suspense>;
}
