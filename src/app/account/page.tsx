"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Package, MapPin, User as UIcon, Settings, LogOut, Truck } from "lucide-react";
import { useAuth, useToast } from "@/lib/store";
import { money, ORDER_STEPS, ORDER_LABEL } from "@/lib/data";
import { SafeImg } from "@/components/site";

export default function AccountPage() {
  const { me, loading, refresh, logout } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState<any[]>([]);
  const [addrs, setAddrs] = useState<any[]>([]);
  const [profile, setProfile] = useState({ name: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !me) { localStorage.setItem("vpb_back", "/account"); router.push("/login"); }
    if (me) {
      setProfile({ name: me.name || "" });
      fetch("/api/orders", { credentials: "include" }).then((r) => r.json()).then((j) => setOrders(j.orders || [])).catch(() => {});
      fetch("/api/extra?res=addresses", { credentials: "include" }).then((r) => r.json()).then((j) => setAddrs(j.addresses || [])).catch(() => {});
    }
  }, [me, loading, router]);

  if (loading) return <div className="mx-auto max-w-5xl px-4 py-10"><div className="skel h-40" /></div>;
  if (!me) return null;

  const saveProfile = async () => {
    setBusy(true);
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "update", ...profile }) });
    const j = await r.json(); setBusy(false);
    if (j.ok) { toast("Profile updated"); refresh(); } else toast(j.error || "Failed");
  };

  const tabs = [["orders", Package, "My Orders"], ["addresses", MapPin, "Addresses"], ["profile", UIcon, "Profile"], ["settings", Settings, "Settings"]];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#7a1f1f]">My Account</p>
          <h1 className="font-serif text-3xl font-bold">Namaste, {me.name.split(" ")[0]} 🙏</h1></div>
        <button onClick={async () => { await logout(); router.push("/"); }} className="btn-ghost !py-2.5 text-[13px]"><LogOut size={15} /> Logout</button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="card h-fit p-3 lg:sticky lg:top-28">
          {tabs.map(([k, Icon, l]: any) => (
            <button key={k} onClick={() => setTab(k)} className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold ${tab === k ? "bg-[#7a1f1f] text-white" : "hover:bg-[#f6ead2]"}`}><Icon size={16} />{l}</button>
          ))}
          <Link href="/track-order" className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold hover:bg-[#f6ead2]"><Truck size={16} />Track Order</Link>
        </div>

        <div>
          {tab === "orders" && (
            <div className="space-y-3">
              {orders.length === 0 && <div className="card p-8 text-center"><p className="font-serif text-xl font-bold">No orders yet</p><p className="text-sm text-stone-500">Your VPB orders will appear here.</p><Link href="/shop" className="btn-primary mt-4">Shop Now</Link></div>}
              {orders.map((o) => (
                <div key={o.id} className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="font-bold">{o.orderNumber}</p><p className="text-xs text-stone-500">{new Date(o.createdAt).toLocaleString("en-IN")} • {o.items?.length || 0} items</p></div>
                    <div className="flex flex-wrap gap-2">
                      <span className="pill bg-[#fff4de] text-[#7a5b1e]">{ORDER_LABEL[o.orderStatus] || o.orderStatus}</span>
                      <span className={`pill ${o.paymentStatus === "paid" ? "bg-green-100 text-green-800" : o.paymentStatus === "failed" ? "bg-red-100 text-red-800" : o.paymentStatus === "refunded" ? "bg-purple-100 text-purple-800" : "bg-amber-100 text-amber-800"}`}>Payment: {o.paymentStatus}</span>
                      {o.razorpayPaymentId && <span className="pill bg-stone-100 font-mono text-[10px] text-stone-600">{o.razorpayPaymentId}</span>}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
                    {(o.items || []).map((it: any) => (
                      <span key={it.id} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#f6ead2]"><SafeImg src={it.productImage} alt={it.productName} sizes="56px" className="object-cover" /></span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-dashed border-[#e7d6b8] pt-3">
                    <b className="font-serif text-lg">{money(o.total)}</b>
                    <div className="flex gap-2">
                      <Link href={`/track-order?num=${o.orderNumber}`} className="btn-ghost !px-4 !py-2 text-[12.5px]">Track</Link>
                      <Link href={`/track-order?num=${o.orderNumber}`} className="btn-primary !px-4 !py-2 text-[12.5px]">Details</Link>
                    </div>
                  </div>
                  {/* mini timeline */}
                  <div className="mt-3 flex items-center gap-1">
                    {ORDER_STEPS.map((s, i) => {
                      const cur = ORDER_STEPS.indexOf(o.orderStatus);
                      return (
                        <span key={s} className="flex flex-1 items-center gap-1">
                          <span className={`h-2 flex-1 rounded-full ${i <= cur ? "bg-[#7a1f1f]" : "bg-[#ecdcb9]"}`} />
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "addresses" && (
            <div className="card p-6">
              <h3 className="font-serif text-xl font-bold">Saved Addresses</h3>
              <div className="mt-3 grid gap-2">{addrs.map((a) => (<div key={a.id} className="rounded-2xl border border-[#ecdcb9] p-4 text-sm"><b>{a.name}</b> • {a.phone}<br />{a.addressLine}, {a.city}, {a.state} — {a.pincode}{a.isDefault && <span className="pill ml-2 bg-green-100 text-green-800">Default</span>}</div>))}
                {addrs.length === 0 && <p className="text-sm text-stone-500">No addresses. Add one at checkout.</p>}</div>
            </div>
          )}

          {tab === "profile" && (
            <div className="card p-6">
              <h3 className="font-serif text-xl font-bold">Profile</h3>
              <p className="mt-1 text-sm text-stone-500">{me.phone} • {me.role}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div><p className="label">Full Name</p><input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="input" /></div>
              </div>
              <button onClick={saveProfile} disabled={busy} className="btn-primary mt-4 disabled:opacity-60">{busy ? "Saving…" : "Save Changes"}</button>
            </div>
          )}

          {tab === "settings" && (
            <div className="card p-6">
              <h3 className="font-serif text-xl font-bold">Account Settings</h3>
              <p className="mt-2 text-sm text-stone-500">To change your password or deactivate your account, contact us on WhatsApp +91 97273 28905.</p>
              <button onClick={async () => { await logout(); router.push("/"); }} className="btn-ghost mt-4">Logout from all devices</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
