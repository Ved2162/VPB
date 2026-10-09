"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useToast } from "@/lib/store";

export default function RegisterPage() {
  const [f, setF] = useState({ name: "", phone: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const { me, loading, refresh } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  // Redirect away if already authenticated
  useEffect(() => {
    if (!loading && me) {
      router.replace(me.role === "admin" ? "/admin" : "/account");
    }
  }, [me, loading, router]);

  if (loading || me) return <div className="mx-auto max-w-md px-4 py-12"><div className="skel h-64 rounded-[22px]" /></div>;

  const submit = async () => {
    setErr(""); setBusy(true);
    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "register", ...f }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) { setErr(j.error); return; }
    await refresh();
    toast("Account created. Welcome to VPB!");
    const back = localStorage.getItem("vpb_back");
    localStorage.removeItem("vpb_back");
    router.replace(back || "/account");
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card p-7">
        <p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#7a1f1f]">Join VPB</p>
        <h1 className="mt-1 font-serif text-3xl font-bold">Create Account</h1>
        {err && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p>}
        <div className="mt-4 space-y-3">
          <div>
            <p className="label">Full Name</p>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="input" placeholder="Your name" autoFocus />
          </div>
          <div>
            <p className="label">Mobile Number</p>
            <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} type="tel" className="input" placeholder="97273 28905" maxLength={15} />
          </div>
          <div>
            <p className="label">Password (min 6 characters)</p>
            <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} type="password" className="input" onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••" />
          </div>
          <button onClick={submit} disabled={busy} className="btn-primary w-full disabled:opacity-60">
            {busy ? "Creating…" : "Create Account"}
          </button>
        </div>
        <p className="mt-4 text-center text-sm">Have an account? <Link href="/login" className="font-bold text-[#7a1f1f]">Login</Link></p>
      </div>
    </div>
  );
}