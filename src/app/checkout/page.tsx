"use client";
import { OtpAnimation, SectionLoader, ButtonLoader, LoadingError, useApiActivity } from "@/components/loading";
import { useApiResource } from "@/lib/use-api-resource";
import { apiFetch } from "@/lib/api-client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandedLink as Link } from "@/components/loading";
import { Check, Lock, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useCart, useAuth, useToast } from "@/lib/store";
import { money } from "@/lib/data";
import { SafeImg } from "@/components/site";
import RazorpayLoader, { openRazorpay } from "@/lib/razorpay-client";
import { InvoiceActions } from '@/components/invoice-actions';

const STEPS = ["Account", "Address", "Summary", "Payment", "Done"];

export default function CheckoutPage() {
  const { lines, subtotal, clear, ready } = useCart();
  const { me, loading, refresh, setUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [chosenStep, setStep] = useState<number | null>(null);
  const addressData = useApiResource<{ addresses: any[] }>(me ? "/api/extra?res=addresses" : null);
  const addrs = addressData.data?.addresses || [];
  const otpBusy = useApiActivity("/api/otp");
  const sendingOtp = useApiActivity("/api/otp/send");
  const [verifiedOtp, setVerifiedOtp] = useState(false);
  const addressBusy = useApiActivity("/api/extra");
  const [selectedAddress, setSel] = useState<any>(null);
  const sel = selectedAddress || addrs.find(address => address.isDefault) || addrs[0] || null;
  const step = !me ? 0 : chosenStep ?? (sel ? 2 : 1);
  const [form, setForm] = useState({ name: "", phone: "", addressLine: "", city: "", state: "", pincode: "", landmark: "" });
  const [pay, setPay] = useState("upi");
  const [placing, setPlacing] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<{ razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string } | null>(null);
  const [order, setOrder] = useState<any>(null);
  // OTP auth state for checkout Step 1
  const [otpName, setOtpName] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState<"phone" | "otp">("phone");
  const [otpMasked, setOtpMasked] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [err, setErr] = useState("");

  const discount = subtotal >= 6000 ? 200 : 0;
  const ship = subtotal === 0 ? 0 : subtotal - discount >= 6000 ? 0 : 99;
  const total = subtotal - discount + ship;

  // OTP cooldown timer
  const otpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (otpCooldown > 0) {
      otpTimerRef.current = setInterval(() => setOtpCooldown((c) => c <= 1 ? (clearInterval(otpTimerRef.current!), 0) : c - 1), 1000);
    }
    return () => { if (otpTimerRef.current) clearInterval(otpTimerRef.current); };
  }, [otpCooldown]);

  const sendOtp = async () => {
    if (otpBusy) return;
    setErr("");
    if (!otpPhone.trim()) { setErr("Enter your mobile number"); return; }
    const r = await apiFetch("/api/otp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: otpPhone }) });
    const j = await r.json();
    if (!j.ok) { if (j.cooldown) setOtpCooldown(j.cooldown); setErr(j.error); return; }
    setOtpMasked(j.masked); setOtpStep("otp"); setOtpCooldown(60); toast("OTP sent!");
  };

  const verifyOtp = async () => {
    if (otpBusy) return;
    setErr("");
    if (otpCode.length !== 6) { setErr("Enter the 6-digit OTP"); return; }
    const r = await apiFetch("/api/otp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ phone: otpPhone, otp: otpCode, name: otpName.trim() }) });
    const j = await r.json();
    if (!j.ok) { if (j.needName && !otpName.trim()) { setErr("Enter your name"); setOtpStep("phone"); return; } setErr(j.error); return; }
    setVerifiedOtp(true);
    setUser({ id: j.user.id, name: j.user.name, phone: j.user.phone, role: j.user.role });
    toast("Welcome" + (j.isNew ? " to VPB!" : " back, " + j.user.name.split(" ")[0] + "!"));
    setStep(null);
  };

  const saveAddress = async () => {
    if (addressBusy) return;
    if (!form.name || !form.phone || !form.addressLine || !form.city || !form.state || !form.pincode) { toast("Fill all address fields"); return; }
    if (!/^\d{6}$/.test(form.pincode)) { toast("Enter valid 6-digit pincode"); return; }
    const r = await apiFetch("/api/extra", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ res: "address", ...form, isDefault: addrs.length === 0 }), credentials: "include" });
    const j = await r.json();
    if (j.ok) {
      const rr = await apiFetch("/api/extra?res=addresses", { credentials: "include" }).then((x) => x.json());
      addressData.refresh(); setSel(rr.addresses?.[rr.addresses.length - 1] || null);
      setForm({ name: "", phone: "", addressLine: "", city: "", state: "", pincode: "", landmark: "" });
      setStep(2); toast("Address saved");
    } else toast(j.error || "Failed");
  };

  const verifyReceipt = async (receipt: NonNullable<typeof pendingReceipt>) => {
    setPlacing(true); setErr('');
    try {
      const response = await apiFetch('/api/payment/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(receipt) });
      const confirmation = await response.json();
      if (!confirmation.ok) throw new Error(confirmation.error || 'Payment confirmation is pending. Retry verification.');
      const result = await (await apiFetch('/api/orders/' + confirmation.orderId)).json();
      if (!result.ok || !result.order) throw new Error('Payment received. Order details are temporarily unavailable. Retry verification or check My Orders.');
      setOrder(result.order); setPendingReceipt(null); setStep(4); clear(); toast(result.order.fulfillmentPending ? 'Payment received - your order is awaiting review.' : 'Payment successful - order confirmed!');
    } catch (error) { setErr(error instanceof Error ? error.message : 'Unable to confirm payment'); setStep(3); }
    finally { setPlacing(false); }
  };

  const placeOrder = async (retryOrderId?: string) => {
    if (placing) return;
    if (pendingReceipt) { await verifyReceipt(pendingReceipt); return; }
    if (!retryOrderId && !sel) { toast("Select delivery address"); setStep(1); return; }
    setPlacing(true); setErr("");
    try {
      // Always fetch Razorpay order from secure server (no frontend amounts)
      let rz: Response;
      if (retryOrderId) {
        rz = await apiFetch("/api/payment/retry", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ orderId: retryOrderId }) });
      } else {
        rz = await apiFetch("/api/payment/create", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ items: lines.map((l) => ({ id: l.id, qty: l.qty })), address: sel, paymentMethod: pay }) });
      }
      const rj = await rz.json();
      if (!rj.ok) {
        if (rj.needLogin) { setStep(0); toast("Please login to continue payment"); }
        else toast(rj.error || "Could not create payment");
        setPlacing(false); return;
      }

      if (!rj.keyId || rj.keyId === "rzp_test_MISSING" || rj.keyId.includes("xxxxxx")) {
        setErr("Razorpay is not configured on the server. Please add valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the .env file.");
        toast("Payment gateway not configured.");
        setPlacing(false);
        return;
      }

      openRazorpay({
        key: rj.keyId,
        order: rj.order,
        prefill: rj.prefill,
        name: "VPB — Verai Patang Bhandar",
        description: "Premium Bareilly Manjha",
        onSuccess: async (resp) => {
          setPendingReceipt(resp);
          await verifyReceipt(resp);
        },
        onFailure: async (err: any) => {
          if (err?.code === "CANCELLED" && rj?.order?.id) {
            await apiFetch("/api/payment/failed", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ razorpay_order_id: rj.order.id, error: err }) });
            setErr("Payment was cancelled. You can retry without losing your order.");
          } else {
            await apiFetch("/api/payment/failed", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ razorpay_order_id: rj.order.id, error: err }) });
            setErr(err?.description || "Payment failed. You can retry with the same order.");
          }
          setPlacing(false);
        },
      });
    } catch (e: any) { setErr(e?.message || "Payment gateway error. Please retry."); toast("Payment gateway error. Please retry."); setPlacing(false); }
  };

  if (!ready || loading) return <SectionLoader label="Preparing secure checkout…" />;
  if (lines.length === 0 && !order)
    return <div className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="font-serif text-3xl font-bold">Checkout</h1><p className="mt-2 text-stone-500">Your cart is empty.</p><Link href="/shop" className="btn-primary mt-5">Shop Now</Link></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-[clamp(1.7rem,3.6vw,2.5rem)] font-bold">Checkout</h1>
      <div className="mt-5 flex items-center gap-1 overflow-x-auto no-scrollbar">
        {STEPS.map((s, i) => (
          <div key={s} className="flex shrink-0 items-center gap-1.5">
            <span className={`grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold ${i < step ? "bg-green-700 text-white" : i === step ? "bg-[#7a1f1f] text-white" : "bg-[#f1e4c8] text-stone-500"}`}>{i < step ? <Check size={15} /> : i + 1}</span>
            <span className={`text-[13px] font-bold ${i === step ? "text-[#7a1f1f]" : "text-stone-400"}`}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-[#e7d6b8] sm:w-10" />}
          </div>
        ))}
      </div>

      {step === 4 && order ? (
        <div className="card mx-auto mt-8 max-w-xl p-8 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-green-700"><Check size={30} /></span>
          <h2 className="mt-4 font-serif text-2xl font-bold">{order.fulfillmentPending ? 'Payment Received' : 'Order Confirmed!'}</h2>
          <p className="mt-1 text-stone-500">{order.fulfillmentPending ? 'Your payment is recorded. VPB will review your order before confirming fulfillment. Contact support if you need help.' : 'Thank you for shopping with VPB.'}</p>
          <div className="mt-4 rounded-2xl bg-[#fff6e3] p-4 text-sm">
            <p>Order <b>{order.orderNumber}</b></p><p>Total paid <b className="text-[#7a1f1f]">{money(order.total)}</b> via {order.paymentMethod?.toUpperCase()}</p>
            <p>Tracking details will be available after dispatch.</p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2"><Link href={`/track-order?num=${order.orderNumber}`} className="btn-ghost">Track Order</Link><Link href="/account" className="btn-primary">My Orders</Link></div>
          {!order.fulfillmentPending && <InvoiceActions orderId={order.id} />}
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            {step === 0 && (
              <div className="card p-6">
                <h3 className="font-serif text-xl font-bold">Step 1 — Account</h3>
                <p className="mt-1 text-sm text-stone-500">Enter your mobile number to receive an OTP. Your cart is saved.</p>
                {err && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p>}
                <OtpAnimation state={otpBusy ? sendingOtp ? "sending" : "verifying" : err ? "error" : "waiting"} digits={otpCode.length} />
                {otpStep === "phone" ? (
                  <div className="mt-4 space-y-3">
                    <div><p className="label">Full Name <span className="font-normal text-stone-400">(for new accounts)</span></p><input value={otpName} onChange={(e) => setOtpName(e.target.value)} className="input" placeholder="Your name" /></div>
                    <div>
                      <p className="label">Mobile Number</p>
                      <div className="flex gap-2">
                        <span className="flex items-center rounded-xl border border-[#e7d6b8] bg-[#f6f0e8] px-3 text-sm font-bold text-stone-600">+91</span>
                        <input value={otpPhone} onChange={(e) => setOtpPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} type="tel" className="input flex-1" placeholder="9876543210" maxLength={10} />
                      </div>
                    </div>
                    <button onClick={sendOtp} disabled={otpBusy || otpCooldown > 0} className="btn-primary w-full disabled:opacity-60">{otpBusy ? <ButtonLoader label="Sending code…" /> : otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Send OTP"}</button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-stone-500">OTP sent to <b>+91 {otpMasked}</b>. Valid for 1 minute.</p>
                    <div><p className="label">6-digit OTP</p><input value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} type="tel" className="input text-center text-xl font-bold tracking-[0.4em]" placeholder="——————" maxLength={6} autoFocus /></div>
                    <button onClick={verifyOtp} disabled={otpBusy || otpCode.length !== 6} className="btn-primary w-full disabled:opacity-60">{otpBusy ? <ButtonLoader label="Verifying code…" /> : "Verify OTP & Continue"}</button>
                    <div className="flex items-center justify-between text-sm">
                      <button onClick={() => { setOtpStep("phone"); setOtpCode(""); setErr(""); }} className="text-stone-500 hover:text-[#7a1f1f]">← Change number</button>
                      <button onClick={() => { setOtpCode(""); setErr(""); sendOtp(); }} disabled={otpBusy || otpCooldown > 0} className="font-bold text-[#7a1f1f] disabled:text-stone-400">{otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Resend OTP"}</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {verifiedOtp && step >= 1 && <OtpAnimation state="verified" digits={6} />}
            {step >= 1 && me && (
              <div className="space-y-5">
                <div className="card p-6">
                  <div className="flex items-center justify-between"><h3 className="font-serif text-xl font-bold">Step 2 — Delivery Address</h3>{addrs.length > 0 && <button onClick={() => setStep(1)} className="text-sm font-bold text-[#7a1f1f]">Change</button>}</div>
                  <SectionLoader active={addressData.pending} label="Loading delivery addresses…" compact />{addressData.error && <LoadingError error={addressData.error} retry={addressData.refresh} />}{step === 1 ? (
                    <>
                      {addrs.length > 0 && <div className="mt-3 grid gap-2">{addrs.map((a) => (<button key={a.id} onClick={() => { setSel(a); setStep(2); }} className={`rounded-2xl border-2 p-4 text-left text-sm ${sel?.id === a.id ? "border-[#7a1f1f] bg-[#fff6e3]" : "border-[#ecdcb9]"}`}><b>{a.name}</b> • {a.phone}<br />{a.addressLine}, {a.city}, {a.state} — {a.pincode}</button>))}</div>}
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div><p className="label">Full Name</p><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></div>
                        <div><p className="label">Phone</p><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" /></div>
                        <div className="sm:col-span-2"><p className="label">Address</p><input value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} className="input" placeholder="House no, street, area" /></div>
                        <div><p className="label">City</p><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input" /></div>
                        <div><p className="label">State</p><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="input" /></div>
                        <div><p className="label">Pincode</p><input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} className="input" maxLength={6} /></div>
                        <div><p className="label">Landmark (optional)</p><input value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} className="input" /></div>
                      </div>
                      <button onClick={saveAddress} disabled={addressBusy} className="btn-primary mt-4 disabled:opacity-60">{addressBusy ? <ButtonLoader label="Updating addresses…" /> : "Save & Continue"}</button>
                    </>
                  ) : sel ? (
                    <div className="mt-3 rounded-2xl bg-[#fff6e3] p-4 text-sm"><b>{sel.name}</b> • {sel.phone}<br />{sel.addressLine}, {sel.city}, {sel.state} — {sel.pincode}</div>
                  ) : null}
                </div>

                {step >= 2 && (
                  <div className="card p-6">
                    <h3 className="font-serif text-xl font-bold">Step 3 — Order Summary</h3>
                    <div className="mt-3 space-y-2">
                      {lines.map((l) => (
                        <div key={l.id} className="flex items-center gap-3 text-sm">
                          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#f6ead2]"><SafeImg src={l.image} alt={l.name} sizes="48px" className="object-cover" /></span>
                          <span className="flex-1 font-semibold">{l.name} × {l.qty}</span><b>{money(l.price * l.qty)}</b>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setStep(3)} className="btn-ghost mt-4">Continue to Payment</button>
                  </div>
                )}

                {step >= 3 && (
                  <div className="card p-6">
                    <h3 className="font-serif text-xl font-bold">Step 4 — Payment</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500"><Lock size={12} /> Secured test payment. No real card stored.</p>
                    <div className="mt-3 grid gap-2">
                      {[["upi", "UPI — GPay / PhonePe / Paytm"], ["card", "Credit / Debit Card"]].map(([v, l]) => (
                        <button key={v} onClick={() => setPay(v)} className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left text-sm font-bold ${pay === v ? "border-[#7a1f1f] bg-[#fff6e3]" : "border-[#ecdcb9]"}`}>
                          <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${pay === v ? "border-[#7a1f1f]" : "border-stone-300"}`}>{pay === v && <span className="h-2.5 w-2.5 rounded-full bg-[#7a1f1f]" />}</span>{l}
                        </button>
                      ))}
                    </div>
                    {pay === "upi" && <input placeholder="yourname@upi" className="input mt-3" />}
                    <p className="rounded-xl bg-[#fff4de] px-3 py-2 text-[12.5px] font-semibold text-[#7a5b1e]">You will be redirected to Razorpay&apos;s secure UPI/Card checkout. We do not store card details.</p>
                    {err && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        <span className="flex-1">{err}</span>
                        <button onClick={() => placeOrder()} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-red-800 ring-1 ring-red-200"><RefreshCw size={12} /> Retry</button>
                      </div>
                    )}
                    <button onClick={() => placeOrder()} disabled={placing} className="btn-primary mt-4 w-full !py-4 !text-[15px] disabled:opacity-60">
                      {placing ? <ButtonLoader label="Processing payment…" /> : pendingReceipt ? "Retry payment verification" : <><Lock size={15} /> Pay {money(total)}</>}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card h-fit p-6 lg:sticky lg:top-28">
            <h3 className="font-serif text-lg font-bold">Summary</h3>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-stone-500">Subtotal</span><b>{money(subtotal)}</b></div>
              <div className="flex justify-between"><span className="text-stone-500">Discount</span><b className="text-green-700">-{money(discount)}</b></div>
              <div className="flex justify-between"><span className="text-stone-500">Shipping</span><b>{ship === 0 ? "FREE" : money(ship)}</b></div>
              <div className="flex justify-between border-t border-dashed border-[#e7d6b8] pt-2 font-serif text-lg font-black"><span>Total</span><span className="text-[#7a1f1f]">{money(total)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
