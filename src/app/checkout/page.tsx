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

import { InvoiceActions } from '@/components/invoice-actions';
import { submitPayuForm } from '@/lib/payu-navigation';
import { orderDiscount, payableTotal } from '@/lib/pricing';
import { PaymentSessionModal } from '@/components/payment-session-modal';

const STEPS = ["Account", "Address", "Summary", "Payment", "Done"];

export default function CheckoutPage() {
  const { lines, subtotal: cartSubtotal, clear, ready } = useCart();
  const { me, loading, refresh, setUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [chosenStep, setStep] = useState<number | null>(null);
  const addressData = useApiResource<{ addresses: any[]; email?: string | null }>(me ? "/api/extra?res=addresses" : null);
  const addrs = addressData.data?.addresses || [];
  const otpBusy = useApiActivity("/api/otp");
  const sendingOtp = useApiActivity("/api/otp/send");
  const [verifiedOtp, setVerifiedOtp] = useState(false);
  const addressBusy = useApiActivity("/api/extra");
  const [selectedAddress, setSel] = useState<any>(null);
  const sel = selectedAddress || addrs.find(address => address.isDefault) || addrs[0] || null;
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const deliveryEmail = emailDraft ?? addressData.data?.email ?? '';
  const hasDeliveryEmail = deliveryEmail.trim().length <= 180 && /^[^\s@|]+@[^\s@|]+\.[^\s@|]+$/.test(deliveryEmail.trim());
  const step = !me ? 0 : chosenStep ?? (sel && addressData.data?.email ? 2 : 1);
  const [form, setForm] = useState({ name: "", phone: "", addressLine: "", city: "", state: "", pincode: "", landmark: "" });
  const [placing, setPlacing] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<string | null>(null);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const restoredPayment = useRef(false);
  const paymentAction = useRef(false);
  const verificationAction = useRef(false);
  const [verificationPaused, setVerificationPaused] = useState(false);
  const pollCount = useRef(0);
  const [order, setOrder] = useState<any>(null);
  // OTP auth state for checkout Step 1
  const [otpName, setOtpName] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState<"phone" | "otp">("phone");
  const [otpMasked, setOtpMasked] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [err, setErr] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const MAX_ATTEMPTS = 3;
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [isCancellingSession, setIsCancellingSession] = useState(false);
  const hasShownSessionModal = useRef(false);
  const [checkoutLocked, setCheckoutLocked] = useState(false);
  const checkLockInProgress = useRef(false);

  const subtotal = order?.subtotal ?? cartSubtotal;
  const discount = order?.discount ?? orderDiscount(subtotal);
  const ship = order?.shippingCharge ?? 0;
  const total = order?.total ?? payableTotal(subtotal, ship);

  // Countdown timer for rate-limit cooldown
  useEffect(() => {
    if (retryAfter <= 0) return;
    const t = window.setTimeout(() => setRetryAfter(n => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [retryAfter]);

  const showErr = (msg: string, seconds?: number) => {
    setErr(msg);
    if (seconds && seconds > 0) setRetryAfter(seconds);
  };

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
    if (!j.ok) { if (j.cooldown) setOtpCooldown(j.cooldown); showErr(j.error || 'Unable to send OTP. Please try again.'); return; }
    setOtpMasked(j.masked); setOtpStep("otp"); setOtpCooldown(60); toast("OTP sent!");
  };

  const verifyOtp = async () => {
    if (otpBusy) return;
    setErr("");
    if (otpCode.length !== 6) { setErr("Enter the 6-digit OTP"); return; }
    const r = await apiFetch("/api/otp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ phone: otpPhone, otp: otpCode, name: otpName.trim() }) });
    const j = await r.json();
    if (!j.ok) { if (j.needName && !otpName.trim()) { showErr("Enter your name"); setOtpStep("phone"); return; } showErr(j.error || 'Verification failed. Please try again.'); return; }
    setVerifiedOtp(true);
    setUser({ id: j.user.id, name: j.user.name, phone: j.user.phone, role: j.user.role });
    toast("Welcome" + (j.isNew ? " to VPB!" : " back, " + j.user.name.split(" ")[0] + "!"));
    setStep(null);
  };

  const saveAddress = async () => {
    if (addressBusy) return;
    if (!hasDeliveryEmail) { toast('Enter a valid email address with your delivery details'); return; }
    if (!form.name || !form.phone || !form.addressLine || !form.city || !form.state || !form.pincode) { toast("Fill all address fields"); return; }
    if (!/^\d{6}$/.test(form.pincode)) { toast("Enter valid 6-digit pincode"); return; }
    const r = await apiFetch("/api/extra", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ res: "address", ...form, email: deliveryEmail.trim(), isDefault: addrs.length === 0 }), credentials: "include" });
    const j = await r.json();
    if (j.ok) {
      const rr = await apiFetch("/api/extra?res=addresses", { credentials: "include" }).then((x) => x.json());
      addressData.refresh(); setSel(rr.addresses?.[rr.addresses.length - 1] || null);
      setForm({ name: "", phone: "", addressLine: "", city: "", state: "", pincode: "", landmark: "" });
      setStep(2); toast("Address saved");
    } else toast(j.error || "Failed");
  };

  // Check for active checkout lock - prevents concurrent payment attempts
  const checkCheckoutLock = async () => {
    if (checkLockInProgress.current) return;
    checkLockInProgress.current = true;
    try {
      const response = await apiFetch('/api/payment/check-lock', { credentials: 'include' });
      const result = await response.json();
      
      if (result.ok && result.locked) {
        setCheckoutLocked(true);
        setPendingReceipt(result.orderId);
        setPaymentFailed(result.paymentStatus === 'failed');
        
        // Always show modal for locked checkout (even on page load/refresh)
        if (!hasShownSessionModal.current) {
          hasShownSessionModal.current = true;
          setShowSessionModal(true);
          setStep(3);
        }
        return true;
      } else {
        setCheckoutLocked(false);
        return false;
      }
    } catch (error) {
      console.error('Failed to check checkout lock:', error);
      return false;
    } finally {
      checkLockInProgress.current = false;
    }
  };

  const continueWithAddress = async () => {
    if (addressBusy) return;
    if (!sel || !hasDeliveryEmail) { toast('Select an address and enter a valid email address'); return; }
    try {
      const response = await apiFetch('/api/extra', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ res: 'checkout_contact', email: deliveryEmail.trim() }) });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'Unable to save delivery contact');
      addressData.refresh(); setStep(2);
    } catch (error) { toast(error instanceof Error ? error.message : 'Unable to save delivery contact'); }
  };

  const recoverRetiredTestCheckout = (result: { code?: string; error?: string }) => {
    if (result.code !== 'PAYU_TEST_CHECKOUT_ENDED') return false;
    sessionStorage.removeItem('vpb-payu-order');
    sessionStorage.removeItem('vpb-checkout-request');
    window.history.replaceState(null, '', '/checkout');
    setPendingReceipt(null); setOrder(null); setPaymentFailed(false);
    setVerificationPaused(true); pollCount.current = 0; setStep(3);
    setErr(result.error || 'The previous test checkout has ended. Continue to PayU to start a Live checkout.');
    return true;
  };

  const verifyReceipt = async (orderId: string) => {
    if (verificationAction.current) return;
    verificationAction.current = true;
    setPlacing(true); setErr(''); setPendingReceipt(orderId); setStep(3);
    try {
      const response = await apiFetch('/api/payment/payu/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) });
      const confirmation = await response.json();
      if (recoverRetiredTestCheckout(confirmation)) return;
      if (response.status === 404) { sessionStorage.removeItem('vpb-payu-order'); setPendingReceipt(null); }
      if (!confirmation.ok) throw new Error(confirmation.error || 'Payment verification is pending. Check again shortly.');
      const result = await (await apiFetch('/api/orders/' + orderId)).json();
      if (!result.ok || !result.order) throw new Error('Order details are temporarily unavailable. Check again or visit My Orders.');
      setOrder(result.order);
      setPaymentFailed(confirmation.paymentStatus === 'failed');
      if (typeof confirmation.attemptCount === 'number') setAttemptCount(confirmation.attemptCount);
      if (confirmation.paymentStatus !== 'paid') {
        setVerificationPaused(false);
        setErr(confirmation.paymentStatus === 'failed'
          ? 'Payment failed or was cancelled. Use the button below to retry on the same order.'
          : 'PayU has not confirmed a final result yet. If the PayU page is still open, complete or cancel it there. Otherwise tap \'Check payment status\' in a minute — your order is saved. Order: ' + (result.order?.orderNumber || orderId));
        return;
      }
      setPendingReceipt(null); setStep(4); clear();
      sessionStorage.removeItem('vpb-payu-order');
      sessionStorage.removeItem('vpb-checkout-request');
      window.history.replaceState(null, '', '/checkout');
      toast(result.order.fulfillmentPending ? 'Payment received - your order is awaiting review.' : 'Payment successful - order confirmed!');
    } catch (error) { setVerificationPaused(true); showErr(error instanceof Error ? error.message : 'Unable to confirm payment'); }
    finally { verificationAction.current = false; setPlacing(false); }
  };

  useEffect(() => {
    if (!pendingReceipt || placing || paymentFailed || verificationPaused || pollCount.current >= 5) return;
    const timer = window.setTimeout(() => {
      pollCount.current++;
      void verifyReceipt(pendingReceipt);
    }, 5000 * (pollCount.current + 1));
    return () => window.clearTimeout(timer);
    // Bounded recovery; manual checks remain available after polling or outages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReceipt, placing, paymentFailed, verificationPaused]);

  useEffect(() => {
    if (!me || loading || restoredPayment.current) return;
    const orderId = new URLSearchParams(window.location.search).get('paymentOrder') || sessionStorage.getItem('vpb-payu-order');
    // Restore browser storage after hydration; cancel the task on unmount.
    const timer = window.setTimeout(async () => {
      restoredPayment.current = true;
      
      // First check if there's an active checkout lock
      const hasLock = await checkCheckoutLock();
      
      // If no lock but we have an orderId from URL/storage, verify it
      if (!hasLock && orderId && /^[0-9a-f-]{36}$/i.test(orderId)) {
        // Check if user returned from PayU - show Leave/Stay modal
        const returnedFromPayu = new URLSearchParams(window.location.search).has('paymentOrder');
        if (returnedFromPayu && !hasShownSessionModal.current) {
          hasShownSessionModal.current = true;
          setShowSessionModal(true);
          setPendingReceipt(orderId);
          setStep(3);
        } else {
          void verifyReceipt(orderId);
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // Restore once after login; authenticated API determines payment state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, loading]);

  // Periodic checkout lock check - handles browser back, multiple tabs, etc.
  useEffect(() => {
    if (!me || loading) return;
    
    // Check on mount
    void checkCheckoutLock();
    
    // Check every 5 seconds while on checkout page
    const interval = setInterval(() => {
      void checkCheckoutLock();
    }, 5000);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, loading]);

  const placeOrder = async (retryOrderId?: string) => {
    if (placing || paymentAction.current) return;
    
    // Check for active checkout lock before allowing new payment
    if (!retryOrderId && checkoutLocked) {
      toast('You have an active payment session. Please complete or cancel it first.');
      return;
    }
    
    if (pendingReceipt && !paymentFailed) { await verifyReceipt(pendingReceipt); return; }
    const existingId = retryOrderId || pendingReceipt;
    if (!existingId && (!sel || !hasDeliveryEmail)) { toast('Complete your delivery address and email first'); setStep(1); return; }
    paymentAction.current = true;
    setPlacing(true); setErr(''); setStep(3);
    try {
      const fingerprint = JSON.stringify({ items: lines.map(l => ({ id: l.id, qty: l.qty })), address: sel });
      let checkoutRequest: { id: string; fingerprint: string } | null = null;
      try { checkoutRequest = JSON.parse(sessionStorage.getItem('vpb-checkout-request') || 'null'); } catch { /* Reset invalid browser state. */ }
      if (!checkoutRequest || checkoutRequest.fingerprint !== fingerprint) {
        checkoutRequest = { id: crypto.randomUUID(), fingerprint };
        sessionStorage.setItem('vpb-checkout-request', JSON.stringify(checkoutRequest));
      }
      const response = await apiFetch(existingId ? '/api/payment/retry' : '/api/payment/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(existingId ? { orderId: existingId } : { items: lines.map(l => ({ id: l.id, qty: l.qty })), address: sel, email: deliveryEmail.trim(), idempotencyKey: checkoutRequest.id }) });
      const result = await response.json();
      if (recoverRetiredTestCheckout(result)) return;
      if (!response.ok || !result.ok) {
        if (response.status === 429) {
          const secs = result.retryAfter || 120;
          showErr(`Too many payment attempts. Please wait ${secs} seconds before trying again.`, secs);
        } else {
          throw new Error(result.error || 'Unable to prepare payment');
        }
        return;
      }
      if (typeof result.attemptCount === 'number') setAttemptCount(result.attemptCount);
      if (result.alreadyPaid) { await verifyReceipt(result.orderId); return; }
      if (result.needsVerification) {
        // A previous PayU attempt is still pending — do not auto-verify (can show confusing errors).
        // Store the order and let the customer check status manually.
        sessionStorage.setItem('vpb-payu-order', result.orderId);
        setPendingReceipt(result.orderId); setPaymentFailed(false); setStep(3);
        if (typeof result.attemptCount === 'number') setAttemptCount(result.attemptCount);
        pollCount.current = 0; setVerificationPaused(false);
        return;
      }
      if (!['https://test.payu.in/_payment', 'https://secure.payu.in/_payment'].includes(result.action)) throw new Error('Invalid checkout destination');
      sessionStorage.setItem('vpb-payu-order', result.orderId);
      setPendingReceipt(result.orderId); setPaymentFailed(false);
      if (result.orderSummary) setOrder(result.orderSummary);
      pollCount.current = 0; setVerificationPaused(false);
      await submitPayuForm(result.action, result.fields);
    } catch (error) { setVerificationPaused(true); showErr(error instanceof Error ? error.message : 'Payment gateway error. Please retry.'); }
    finally { paymentAction.current = false; setPlacing(false); }
  };

  const handleStayPayment = () => {
    setShowSessionModal(false);
    if (pendingReceipt) {
      void placeOrder(pendingReceipt);
    }
  };

  const handleLeavePayment = async () => {
    if (!pendingReceipt || isCancellingSession) return;
    setIsCancellingSession(true);
    try {
      const response = await apiFetch('/api/payment/cancel-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderId: pendingReceipt })
      });
      const result = await response.json();
      
      if (!result.ok) {
        throw new Error(result.error || 'Unable to process cancellation request');
      }

      setShowSessionModal(false);

      // Handle different cancellation outcomes
      if (result.status === 'verified_paid' || result.status === 'already_paid') {
        // Payment was actually successful!
        setPaymentFailed(false);
        setCheckoutLocked(false);
        await verifyReceipt(pendingReceipt);
        toast('Payment was successfully completed!');
      } else if (result.status === 'verified_failed') {
        // Payment confirmed as failed/cancelled - lock cleared
        setPaymentFailed(true);
        setCheckoutLocked(false); // Unlock checkout for retry
        setVerificationPaused(true);
        sessionStorage.removeItem('vpb-payu-order');
        toast(result.message || 'Payment session cancelled');
      } else if (result.status === 'still_pending') {
        // Still processing at PayU - keep locked
        setVerificationPaused(true);
        setErr(result.message || 'Payment is still being processed');
      } else if (result.status === 'verification_unavailable') {
        // Could not verify - show manual check option
        setVerificationPaused(true);
        setErr(result.message || 'Unable to verify payment status. Please try checking again.');
      }
      
      // Re-check lock status after cancellation
      await checkCheckoutLock();
    } catch (error) {
      setShowSessionModal(false);
      setVerificationPaused(true);
      showErr(error instanceof Error ? error.message : 'Unable to process cancellation request');
    } finally {
      setIsCancellingSession(false);
    }
  };

  if (!ready || loading) return <SectionLoader label="Preparing secure checkout…" />;
  if (lines.length === 0 && !order && !pendingReceipt)
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
                      <label className="mt-3 block text-sm font-semibold">Email address<input type="email" autoComplete="email" required value={deliveryEmail} onChange={e => setEmailDraft(e.target.value)} placeholder="you@example.com" className="input mt-2" /></label>
                      {addrs.length > 0 && <div className="mt-3 grid gap-2">{addrs.map((a) => (<button key={a.id} onClick={() => setSel(a)} className={`rounded-2xl border-2 p-4 text-left text-sm ${sel?.id === a.id ? "border-[#7a1f1f] bg-[#fff6e3]" : "border-[#ecdcb9]"}`}><b>{a.name}</b> • {a.phone}<br />{a.addressLine}, {a.city}, {a.state} — {a.pincode}</button>))}</div>}
                      {addrs.length > 0 && <button onClick={continueWithAddress} disabled={addressBusy} className="btn-primary mt-3 disabled:opacity-60">{addressBusy ? <ButtonLoader label="Saving delivery details..." /> : 'Use selected address'}</button>}
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

                {step === 2 && (
                  <div className="card p-6">
                    <h3 className="font-serif text-xl font-bold">Step 3 — Order Summary</h3>
                    <div className="mt-3 space-y-2">
                      {order && pendingReceipt ? <p className="text-sm">Saved order <b>{order.orderNumber}</b> Total {money(order.total)}</p> : lines.map((l) => (
                        <div key={l.id} className="flex items-center gap-3 text-sm">
                          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#f6ead2]"><SafeImg src={l.image} alt={l.name} sizes="48px" className="object-cover" /></span>
                          <span className="flex-1 font-semibold">{l.name} × {l.qty}</span><b>{money(l.price * l.qty)}</b>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => placeOrder()} disabled={placing || checkoutLocked} className="btn-primary mt-4 disabled:opacity-60">
                      {checkoutLocked ? 'Payment Session Active' : 'Continue to Payment'}
                    </button>
                  </div>
                )}

                {step >= 3 && (
                  <div className="card overflow-hidden">
                    {/* Rate-limit cooldown bar */}
                    {retryAfter > 0 && (
                      <div className="rounded-t-[inherit] bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                        Too many attempts — please wait <b>{retryAfter}s</b> before retrying
                      </div>
                    )}

                    <div className="p-6">
                      {/* ── State A: No pending order yet — fresh checkout ── */}
                      {!pendingReceipt && !err && (
                        <>
                          <h3 className="font-serif text-xl font-bold">Step 4 — Payment</h3>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500"><Lock size={12} /> Secure payment. Card details are handled by PayU.</p>
                          <p className="mt-3 rounded-xl bg-[#fff4de] px-4 py-3 text-[13px] text-[#7a5b1e]">Choose your payment method on PayU. After payment, you will return here for confirmation.</p>
                          <button onClick={() => placeOrder()} disabled={placing || retryAfter > 0} className="btn-primary mt-5 w-full !py-4 !text-[15px] disabled:opacity-60">
                            {placing ? <ButtonLoader label="Opening PayU…" /> : <><Lock size={15} /> Continue to PayU</>}
                          </button>
                        </>
                      )}

                      {/* ── State B: Payment not completed, retries remaining ── */}
                      {pendingReceipt && !paymentFailed && attemptCount < MAX_ATTEMPTS && !err && (
                        <>
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#fff4de] text-[#c9a24b]">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            </span>
                            <div>
                              <p className="font-serif text-lg font-bold text-[#1c0f0a]">Payment not completed</p>
                              <p className="mt-1 text-sm text-stone-500">Your order is safely saved. You can continue with payment whenever you're ready.</p>
                              <p className="mt-1 text-xs text-stone-400">No need to place your order again.</p>
                            </div>
                          </div>
                          <div className="mt-5 flex flex-col gap-2.5">
                            <button onClick={() => { setErr(''); placeOrder(pendingReceipt); }} disabled={placing || retryAfter > 0} className="btn-primary w-full !py-3.5 disabled:opacity-60">
                              {placing ? <ButtonLoader label="Opening PayU…" /> : <><Lock size={14} /> Continue to payment</>}
                            </button>
                            <Link href="/account" className="btn-ghost w-full text-center">Return to my orders</Link>
                          </div>
                        </>
                      )}

                      {/* ── State C: Failed / cancelled — show retry with count context ── */}
                      {pendingReceipt && paymentFailed && attemptCount < MAX_ATTEMPTS && !err && (
                        <>
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#fff4de] text-[#c9a24b]">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            </span>
                            <div>
                              <p className="font-serif text-lg font-bold text-[#1c0f0a]">Payment not completed</p>
                              <p className="mt-1 text-sm text-stone-500">Your order is safely saved. You can try paying again — the same order will be used.</p>
                            </div>
                          </div>
                          <div className="mt-5 flex flex-col gap-2.5">
                            <button onClick={() => { setErr(''); placeOrder(pendingReceipt); }} disabled={placing || retryAfter > 0} className="btn-primary w-full !py-3.5 disabled:opacity-60">
                              {placing ? <ButtonLoader label="Opening PayU…" /> : <><Lock size={14} /> Try payment again</>}
                            </button>
                            <Link href="/account" className="btn-ghost w-full text-center">Return to my orders</Link>
                          </div>
                        </>
                      )}

                      {/* ── State D: Pending — payment may still be processing ── */}
                      {pendingReceipt && !paymentFailed && !err && attemptCount >= MAX_ATTEMPTS && (
                        <>
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-500">
                              <Loader2 size={18} className="animate-spin" />
                            </span>
                            <div>
                              <p className="font-serif text-lg font-bold text-[#1c0f0a]">Payment is being verified</p>
                              <p className="mt-1 text-sm text-stone-500">Your payment may still be processing. Your order is saved — we'll update its status once confirmed.</p>
                            </div>
                          </div>
                          <button onClick={() => verifyReceipt(pendingReceipt)} disabled={placing} className="btn-ghost mt-5 w-full !py-3.5">
                            {placing ? <ButtonLoader label="Checking…" /> : <><RefreshCw size={14} /> Check payment status</>}
                          </button>
                        </>
                      )}

                      {/* ── State E: 3+ attempts or explicit error — verification required ── */}
                      {(err || (pendingReceipt && attemptCount >= MAX_ATTEMPTS && paymentFailed)) && (
                        <>
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600">
                              <AlertTriangle size={17} />
                            </span>
                            <div>
                              <p className="font-serif text-lg font-bold text-[#1c0f0a]">
                                {err ? (retryAfter > 0 ? 'Too many attempts' : "We’re unable to confirm your payment") : "We’re unable to confirm your payment"}
                              </p>
                              <p className="mt-1 text-sm text-stone-500">
                                {err || 'Your order is saved. Please check your payment status before attempting another transaction.'}
                              </p>
                            </div>
                          </div>
                          <div className="mt-5 flex flex-col gap-2.5">
                            {pendingReceipt && retryAfter <= 0 && (
                              <button onClick={() => verifyReceipt(pendingReceipt)} disabled={placing} className="btn-primary w-full !py-3.5">
                                {placing ? <ButtonLoader label="Checking…" /> : <><RefreshCw size={14} /> Check payment status</>}
                              </button>
                            )}
                            {pendingReceipt && paymentFailed && retryAfter <= 0 && (
                              <button onClick={() => { setErr(''); placeOrder(pendingReceipt); }} disabled={placing} className="btn-ghost w-full !py-3">
                                {placing ? <ButtonLoader label="Opening PayU…" /> : 'Try payment again'}
                              </button>
                            )}
                            {!pendingReceipt && retryAfter <= 0 && (
                              <button onClick={() => { setErr(''); placeOrder(); }} disabled={placing} className="btn-ghost w-full !py-3">
                                {placing ? <ButtonLoader label="Opening PayU…" /> : <><RefreshCw size={14} /> Retry</>}
                              </button>
                            )}
                          </div>
                        </>
                      )}

                      {/* Secure badge — always shown */}
                      <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-stone-400"><Lock size={10} /> Secured by PayU · 256-bit encryption</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card h-fit p-6 lg:sticky lg:top-28">
            <h3 className="font-serif text-lg font-bold">Summary</h3>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-stone-500">Subtotal</span><b>{money(subtotal)}</b></div>
              <div className="flex justify-between"><span className="text-stone-500">Discount (5%)</span><b className="text-green-700">-{money(discount)}</b></div>
              <div className="flex justify-between"><span className="text-stone-500">Shipping</span><b>{ship === 0 ? "FREE" : money(ship)}</b></div>
              <div className="flex justify-between border-t border-dashed border-[#e7d6b8] pt-2 font-serif text-lg font-black"><span>Total</span><span className="text-[#7a1f1f]">{money(total)}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Session Modal */}
      <PaymentSessionModal
        isOpen={showSessionModal}
        onStay={handleStayPayment}
        onLeave={handleLeavePayment}
        isCancelling={isCancellingSession}
        orderNumber={order?.orderNumber}
      />
    </div>
  );
}
