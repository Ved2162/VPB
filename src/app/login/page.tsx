"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useToast } from "@/lib/store";

// Step 1: Name + Phone  →  Step 2: OTP entry  →  Step 3: Done
type Step = "phone" | "otp";

function LoginForm() {
  const [step, setStep] = useState<Step>("phone");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [masked, setMasked] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { me, loading, refresh, setUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Redirect away if already logged in
  useEffect(() => {
    if (!loading && me) {
      const back = searchParams.get("back") || localStorage.getItem("vpb_back") || "";
      localStorage.removeItem("vpb_back");
      router.replace(back || (me.role === "admin" ? "/admin" : "/account"));
    }
  }, [me, loading, router, searchParams]);

  // Countdown timer for resend
  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setInterval(() => setCooldown((c) => c <= 1 ? (clearInterval(timerRef.current!), 0) : c - 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [cooldown]);

  if (loading || me) return <div className="mx-auto max-w-md px-4 py-12"><div className="skel h-64 rounded-[22px]" /></div>;

  const sendOtp = async () => {
    setErr("");
    if (!phone.trim()) { setErr("Enter your mobile number"); return; }
    setBusy(true);
    const r = await fetch("/api/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) {
      if (j.cooldown) setCooldown(j.cooldown);
      setErr(j.error);
      return;
    }
    setMasked(j.masked);
    setStep("otp");
    setCooldown(60);
    toast("OTP sent!");
  };

  const verifyOtp = async () => {
    setErr("");
    if (otp.length !== 6) { setErr("Enter the 6-digit OTP"); return; }
    setBusy(true);
    const r = await fetch("/api/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ phone, otp, name: name.trim() }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) {
      if (j.needName && !name.trim()) {
        setErr("Enter your name to create an account");
        setStep("phone");
        return;
      }
      setErr(j.error);
      return;
    }
    // Directly update auth context — avoids race between Set-Cookie and next fetch
    setUser({ id: j.user.id, name: j.user.name, phone: j.user.phone, role: j.user.role });
    toast("Welcome" + (j.isNew ? " to VPB!" : " back, " + j.user.name.split(" ")[0] + "!"));
    const back = searchParams.get("back") || localStorage.getItem("vpb_back") || "";
    localStorage.removeItem("vpb_back");
    router.replace(back || "/account");
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card p-7">
        <p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#7a1f1f]">
          {step === "phone" ? "Welcome to VPB" : "Verify OTP"}
        </p>
        <h1 className="mt-1 font-serif text-3xl font-bold">
          {step === "phone" ? "Login / Register" : "Enter OTP"}
        </h1>

        {step === "phone" ? (
          <>
            <p className="mt-1 text-sm text-stone-500">Enter your mobile number to receive an OTP.</p>
            {err && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p>}
            <div className="mt-4 space-y-3">
              <div>
                <p className="label">Full Name <span className="text-stone-400 font-normal">(for new accounts)</span></p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
              <div>
                <p className="label">Mobile Number</p>
                <div className="flex gap-2">
                  <span className="flex items-center rounded-xl border border-[#e7d6b8] bg-[#f6f0e8] px-3 text-sm font-bold text-stone-600">+91</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    type="tel"
                    className="input flex-1"
                    placeholder="9876543210"
                    maxLength={10}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && sendOtp()}
                  />
                </div>
              </div>
              <button
                onClick={sendOtp}
                disabled={busy || cooldown > 0}
                className="btn-primary w-full disabled:opacity-60"
              >
                {busy ? "Sending OTP…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Send OTP"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-stone-500">
              OTP sent to <b>+91 {masked}</b>. Valid for 5 minutes.
            </p>
            {err && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p>}
            <div className="mt-4 space-y-3">
              <div>
                <p className="label">Enter 6-digit OTP</p>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  type="tel"
                  className="input text-center text-2xl font-bold tracking-[0.5em]"
                  placeholder="——————"
                  maxLength={6}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && verifyOtp()}
                />
              </div>
              <button
                onClick={verifyOtp}
                disabled={busy || otp.length !== 6}
                className="btn-primary w-full disabled:opacity-60"
              >
                {busy ? "Verifying…" : "Verify OTP"}
              </button>
              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={() => { setStep("phone"); setOtp(""); setErr(""); }}
                  className="text-stone-500 hover:text-[#7a1f1f]"
                >
                  ← Change number
                </button>
                <button
                  onClick={() => { setOtp(""); setErr(""); sendOtp(); }}
                  disabled={cooldown > 0 || busy}
                  className="font-bold text-[#7a1f1f] disabled:text-stone-400 disabled:cursor-not-allowed"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-12"><div className="skel h-64 rounded-[22px]" /></div>}>
      <LoginForm />
    </Suspense>
  );
}