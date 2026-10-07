"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useToast } from "@/lib/store";

export default function AdminLogin() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();
  const { refresh } = useAuth();
  const { toast } = useToast();
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-[22px] bg-[#1c0f0a] p-8 text-[#f0d9a8]">
        <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#c9a24b]">VPB Admin</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-white">Control Room</h1>
        {err && <p className="mt-3 rounded-xl bg-red-900/60 px-3 py-2 text-sm font-semibold text-red-200">{err}</p>}
        <p className="label mt-4 !text-[#c9a24b]">Admin Mobile Number</p>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          className="input !border-white/20 !bg-white/10 !text-white"
          placeholder="97273 28905"
          maxLength={15}
        />
        <p className="label mt-3 !text-[#c9a24b]">Password</p>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          className="input !border-white/20 !bg-white/10 !text-white"
          onKeyDown={(e) => e.key === "Enter" && (document.getElementById("abtn") as HTMLButtonElement)?.click()}
        />
        <button id="abtn" onClick={async () => {
          setErr("");
          const r = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ action: "login", phone, password }),
          });
          const j = await r.json();
          if (!j.ok) { setErr(j.error); return; }
          if (j.user.role !== "admin") { setErr("Not an admin account"); return; }
          await refresh();
          toast("Welcome, Admin");
          router.push("/admin");
        }} className="btn-gold mt-5 w-full">Login to Dashboard</button>
      </div>
    </div>
  );
}
