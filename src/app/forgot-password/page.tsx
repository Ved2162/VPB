"use client";
import { useState } from "react";
import Link from "next/link";
export default function Forgot() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card p-7">
        <h1 className="font-serif text-2xl font-bold">Forgot Password</h1>
        <p className="mt-1 text-sm text-stone-500">Enter your email — we'll send a reset link.</p>
        {msg && <p className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">{msg}</p>}
        <p className="label mt-4">Email</p>
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" />
        <button onClick={async () => {
          const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "forgot", email }) });
          const j = await r.json(); setMsg(j.message || "Done");
        }} className="btn-primary mt-3 w-full">Send Reset Link</button>
        <p className="mt-3 text-center text-sm"><Link href="/login" className="font-bold text-[#7a1f1f]">Back to Login</Link></p>
      </div>
    </div>
  );
}
