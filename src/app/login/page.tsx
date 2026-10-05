"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useToast } from "@/lib/store";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const { refresh } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const submit = async () => {
    setErr(""); setBusy(true);
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "login", email, password }) });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) { setErr(j.error); return; }
    await refresh();
    toast("Welcome back, " + j.user.name.split(" ")[0] + "!");
    if (j.user.role === "admin") router.push("/admin");
    else {
      const back = localStorage.getItem("vpb_back");
      localStorage.removeItem("vpb_back");
      router.push(back || "/account");
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card p-7">
        <p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#7a1f1f]">Welcome back</p>
        <h1 className="mt-1 font-serif text-3xl font-bold">Login to VPB</h1>
        <p className="mt-1 text-sm text-stone-500">New to VPB? <Link href="/register" className="font-bold text-[#7a1f1f]">Create an account</Link></p>
        {err && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p>}
        <div className="mt-4 space-y-3">
          <div><p className="label">Email</p><input value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" /></div>
          <div><p className="label">Password</p><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••" /></div>
          <button onClick={submit} disabled={busy} className="btn-primary w-full disabled:opacity-60">{busy ? "Logging in…" : "Login"}</button>
        </div>
        <div className="mt-4 flex justify-between text-sm">
          <Link href="/register" className="font-bold text-[#7a1f1f]">New here? Register</Link>
          <Link href="/forgot-password" className="text-stone-500 hover:text-[#7a1f1f]">Forgot password?</Link>
        </div>
      </div>
    </div>
  );
}
