"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Package, Tags, ShoppingCart, Users, Megaphone, LogOut, Plus, Trash2, Pencil, Eye } from "lucide-react";
import { useAuth, useToast } from "@/lib/store";
import { money } from "@/lib/data";
import { SafeImg } from "@/components/site";

export default function Admin() {
  const { me, loading, logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState("dash");
  const [stats, setStats] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [content, setContent] = useState<any>({ banners: [], content: [] });
  const [q, setQ] = useState("");
  const [showP, setShowP] = useState(false);
  const [editP, setEditP] = useState<any>(null);
  const [showC, setShowC] = useState(false);
  const [editC, setEditC] = useState<any>(null);
  const [selOrder, setSelOrder] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!loading && (!me || me.role !== "admin")) router.push("/admin/login");
  }, [me, loading, router]);

  const load = async (t = tab, query = q) => {
    setLoadError("");
    try {
      const qs = (extra: string) => fetch("/api/admin?res=" + extra + (query ? "&q=" + encodeURIComponent(query) : ""), { credentials: "include" }).then((r) => r.json());
      if (t === "dash") { const j = await qs("stats"); if (j.ok) setStats(j); else throw new Error(j.error || "Failed"); }
      if (t === "products") { const j = await qs("products"); if (j.ok) setProducts(j.products); const c = await qs("categories"); if (c.ok) setCats(c.categories); }
      if (t === "cats") { const c = await qs("categories"); if (c.ok) setCats(c.categories); }
      if (t === "orders") { const j = await qs("orders"); if (j.ok) setOrders(j.orders); else throw new Error(j.error || "Failed"); }
      if (t === "customers") { const j = await qs("customers"); if (j.ok) setCustomers(j.customers); }
      if (t === "content") { const j = await qs("content"); if (j.ok) setContent(j); }
    } catch (e: any) {
      setLoadError(e?.message || "Unable to load. Check your connection.");
    }
  };
  useEffect(() => { if (me?.role === "admin") { load().catch(() => setLoadError("Unable to load data.")); } // eslint-disable-next-line
  }, [tab, me]);

  if (loading) return <div className="p-10">Loading admin…</div>;
  if (!me || me.role !== "admin") return null;

  const saveProduct = async () => {
    if (!editP?.name || !editP?.price || !editP?.sku) { toast("Name, price, SKU required"); return; }
    setBusy(true);
    const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ res: "product", id: editP.id || undefined, data: { ...editP, images: typeof editP.images === "string" ? editP.images.split("\n").map((s: string) => s.trim()).filter(Boolean) : editP.images } }) });
    const j = await r.json(); setBusy(false);
    if (j.ok) { toast("Product saved — live on site"); setShowP(false); setEditP(null); load(); } else toast(j.error || "Failed");
  };

  const saveCat = async () => {
    if (!editC?.name) { toast("Name required"); return; }
    const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ res: "category", id: editC.id || undefined, data: editC }) });
    const j = await r.json();
    if (j.ok) { toast("Category saved"); setShowC(false); setEditC(null); load(); } else toast(j.error || "Failed");
  };

  const updateOrder = async (patch: any) => {
    const r = await fetch("/api/orders/" + selOrder.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(patch) });
    const j = await r.json();
    if (j.ok) {
      toast("Order updated — customer tracking reflects it");
      const fresh = await fetch("/api/admin?res=order&id=" + selOrder.id, { credentials: "include" }).then((x) => x.json());
      if (fresh.ok) setSelOrder(fresh.order);
      load("orders");
    } else toast(j.error || "Failed");
  };

  const tabs = [["dash", LayoutDashboard, "Dashboard"], ["products", Package, "Products"], ["cats", Tags, "Categories"], ["orders", ShoppingCart, "Orders"], ["customers", Users, "Customers"], ["content", Megaphone, "Content"]];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#7a1f1f]">VPB Admin</p><h1 className="font-serif text-2xl font-bold sm:text-3xl">Dashboard</h1></div>
        <div className="flex gap-2">
          <a href="/" target="_blank" className="btn-ghost !py-2 text-[13px]"><Eye size={14} /> View Store</a>
          <button onClick={async () => { await logout(); router.push("/"); }} className="btn-ghost !py-2 text-[13px]"><LogOut size={14} /> Logout</button>
        </div>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto no-scrollbar">
        {tabs.map(([k, Icon, l]: any) => (
          <button key={k} onClick={() => setTab(k)} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-bold ${tab === k ? "bg-[#1c0f0a] text-[#f0d9a8]" : "bg-white ring-1 ring-[#e7d6b8]"}`}><Icon size={15} />{l}</button>
        ))}
      </div>

      {loadError && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span className="flex-1 font-semibold">{loadError}</span>
          <button onClick={() => load()} className="btn-ghost !border-red-300 !py-1.5 !text-[12px] !text-red-800">Retry</button>
        </div>
      )}

      {tab === "dash" && stats && (
        <div className="mt-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[["Revenue", money(stats.stats.sales)], ["Orders", stats.stats.orders], ["Products", stats.stats.products], ["Customers", stats.stats.customers]].map(([l, v]) => (
              <div key={l} className="card p-5"><p className="text-xs font-bold uppercase tracking-widest text-stone-400">{l}</p><p className="mt-1 font-serif text-2xl font-black">{v}</p></div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="card p-5">
              <p className="font-serif text-lg font-bold">Low Stock Alert ({stats.low?.length})</p>
              <div className="mt-2 max-h-64 overflow-y-auto">{stats.low?.map((p: any) => (<div key={p.id} className="flex items-center justify-between border-b border-[#f3e8d0] py-2 text-sm"><span className="font-semibold">{p.name}</span><span className={`pill ${p.stockQuantity <= 0 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{p.stockQuantity} left</span></div>))}</div>
            </div>
            <div className="card p-5">
              <p className="font-serif text-lg font-bold">Recent Orders</p>
              <div className="mt-2">{stats.recentOrders?.map((o: any) => (<div key={o.id} className="flex items-center justify-between border-b border-[#f3e8d0] py-2 text-sm"><span><b>{o.orderNumber}</b> <span className="text-stone-400">{o.customerName}</span></span><b className="text-[#7a1f1f]">{money(o.total)}</b></div>))}</div>
            </div>
          </div>
          <div className="card mt-3 p-5">
            <p className="font-serif text-lg font-bold">Orders by Status</p>
            <div className="mt-2 flex flex-wrap gap-2">{stats.byStatus?.map((s: any) => (<span key={s.s} className="pill bg-[#fff4de] text-[#7a5b1e] !text-[13px] !px-4 !py-1.5">{s.s}: {s.n}</span>))}</div>
          </div>
        </div>
      )}

      {tab === "products" && (
        <div className="mt-6">
          <div className="flex flex-wrap gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search products…" className="input !w-64" />
            <button onClick={() => load()} className="btn-ghost !py-2 text-[13px]">Search</button>
            <button onClick={() => { setEditP({ name: "", price: 999, comparePrice: "", sku: "VPB-NEW-", stockQuantity: 20, brand: "VPB", cordCount: 6, categoryId: cats[0]?.id || "", images: "", featured: false, bestseller: false, active: true, description: "", reelCount: "3 Reel" }); setShowP(true); }} className="btn-primary !py-2 text-[13px]"><Plus size={15} /> Add Product</button>
          </div>
          <div className="card mt-4 overflow-x-auto">
            <table className="admin-table min-w-[860px]">
              <thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Stock</th><th>Flags</th><th>Actions</th></tr></thead>
              <tbody>{products.map((p) => (
                <tr key={p.id}>
                  <td><span className="flex items-center gap-2"><span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#f6ead2]"><SafeImg src={p.images?.[0]} alt={p.name} sizes="40px" className="object-cover" /></span><span><b>{p.name}</b><br /><span className="text-xs text-stone-400">{p.categoryName} • {p.cordCount} cord</span></span></span></td>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td><b>{money(p.price)}</b></td>
                  <td><span className={`pill ${p.stockQuantity <= 0 ? "bg-red-100 text-red-800" : p.stockQuantity <= 15 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>{p.stockQuantity}</span></td>
                  <td className="text-xs">{p.featured ? "★Feat " : ""}{p.bestseller ? "🔥Best" : ""}{!p.active ? " ⏸Hidden" : ""}</td>
                  <td><span className="flex gap-1.5">
                    <button onClick={() => { setEditP({ ...p, images: (p.images || []).join("\n") }); setShowP(true); }} className="rounded-lg bg-[#f3e6cc] p-2 hover:bg-[#e7d6b8]"><Pencil size={14} /></button>
                    <button onClick={async () => { if (!confirm("Delete " + p.name + "?")) return; await fetch("/api/admin?res=product&id=" + p.id, { method: "DELETE", credentials: "include" }); toast("Deleted"); load(); }} className="rounded-lg bg-red-50 p-2 text-red-700 hover:bg-red-100"><Trash2 size={14} /></button>
                  </span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "cats" && (
        <div className="mt-6">
          <button onClick={() => { setEditC({ name: "", slug: "", description: "", image: "" }); setShowC(true); }} className="btn-primary !py-2 text-[13px]"><Plus size={15} /> Add Category</button>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cats.map((c) => (
              <div key={c.id} className="card flex gap-3 p-4">
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f6ead2]"><SafeImg src={c.image} alt={c.name} sizes="64px" className="object-cover" /></span>
                <div className="min-w-0 flex-1"><b>{c.name}</b><p className="truncate text-xs text-stone-400">/{c.slug} {c.active ? "" : "• Hidden"}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <button onClick={() => { setEditC(c); setShowC(true); }} className="rounded-lg bg-[#f3e6cc] px-2.5 py-1 text-xs font-bold">Edit</button>
                    <button onClick={async () => { if (!confirm("Delete category?")) return; await fetch("/api/admin?res=category&id=" + c.id, { method: "DELETE", credentials: "include" }); toast("Deleted"); load(); }} className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">Delete</button>
                  </div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="mt-6">
          <div className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search order no, name, phone…" className="input !w-72" /><button onClick={() => load()} className="btn-ghost !py-2 text-[13px]">Search</button></div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
            <div className="card overflow-x-auto">
              <table className="admin-table min-w-[640px]">
                <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>{orders.map((o) => (
                  <tr key={o.id} onClick={async () => { try { const j = await fetch("/api/admin?res=order&id=" + o.id, { credentials: "include" }).then((r) => r.json()); if (j.ok) setSelOrder(j.order); else toast(j.error || "Failed to open order"); } catch { toast("Network error"); } }} className="cursor-pointer hover:bg-[#fff9ec]">
                    <td><b>{o.orderNumber}</b><br /><span className="text-xs text-stone-400">{new Date(o.createdAt).toLocaleDateString("en-IN")}</span></td>
                    <td>{o.customerName}<br /><span className="text-xs text-stone-400">{o.customerPhone}</span></td>
                    <td><b>{money(o.total)}</b><br /><span className="text-xs text-stone-400">{o.paymentStatus}</span></td>
                    <td><span className="pill bg-[#fff4de] text-[#7a5b1e]">{o.orderStatus}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="card h-fit p-5 lg:sticky lg:top-24">
              {!selOrder ? <p className="text-sm text-stone-500">Select an order to manage status, courier & tracking.</p> : (
                <div>
                  <p className="font-serif text-lg font-bold">{selOrder.orderNumber}</p>
                  <p className="text-xs text-stone-500">{selOrder.customerName} • {selOrder.customerEmail} • {selOrder.customerPhone}</p>
                  <p className="mt-1 text-xs">{(selOrder.shippingAddress as any)?.addressLine}, {(selOrder.shippingAddress as any)?.city} — {(selOrder.shippingAddress as any)?.pincode}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className={`pill ${selOrder.paymentStatus === "paid" ? "bg-green-100 text-green-800" : selOrder.paymentStatus === "failed" ? "bg-red-100 text-red-800" : selOrder.paymentStatus === "refunded" ? "bg-purple-100 text-purple-800" : "bg-amber-100 text-amber-800"}`}>Payment: {selOrder.paymentStatus}</span>
                    {selOrder.razorpayOrderId && <span className="pill bg-stone-100 font-mono text-stone-600">rzp: {selOrder.razorpayOrderId}</span>}
                    {selOrder.razorpayPaymentId && <span className="pill bg-stone-100 font-mono text-stone-600">pay: {selOrder.razorpayPaymentId}</span>}
                    {selOrder.razorpayWebhookVerified && <span className="pill bg-emerald-50 text-emerald-800">Webhook verified</span>}
                  </div>
                  <div className="mt-2 space-y-1.5 text-sm">{(selOrder.items || []).map((it: any) => (<div key={it.id} className="flex justify-between"><span>{it.productName} × {it.quantity}</span><b>{money(it.price * it.quantity)}</b></div>))}</div>
                  <p className="label mt-4">Order Status</p>
                  <select value={selOrder.orderStatus} onChange={(e) => setSelOrder({ ...selOrder, orderStatus: e.target.value })} className="input">
                    {["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"].map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                  <p className="label mt-3">Payment Status</p>
                  <select value={selOrder.paymentStatus} onChange={(e) => setSelOrder({ ...selOrder, paymentStatus: e.target.value })} className="input">
                    {["pending", "paid", "failed", "refunded"].map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div><p className="label">Courier</p><input value={selOrder.courier || ""} onChange={(e) => setSelOrder({ ...selOrder, courier: e.target.value })} className="input" /></div>
                    <div><p className="label">Tracking No</p><input value={selOrder.trackingNumber || ""} onChange={(e) => setSelOrder({ ...selOrder, trackingNumber: e.target.value })} className="input" /></div>
                  </div>
                  <button onClick={() => updateOrder({ orderStatus: selOrder.orderStatus, paymentStatus: selOrder.paymentStatus, courier: selOrder.courier, trackingNumber: selOrder.trackingNumber })} className="btn-primary mt-4 w-full">Save Changes</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "customers" && (
        <div className="mt-6">
          <div className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search customers…" className="input !w-64" /><button onClick={() => load()} className="btn-ghost !py-2 text-[13px]">Search</button></div>
          <div className="card mt-4 overflow-x-auto">
            <table className="admin-table min-w-[720px]">
              <thead><tr><th>Customer</th><th>Orders</th><th>Spent</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>{customers.map((c: any) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b><br /><span className="text-xs text-stone-400">{c.email} • {c.phone} • {c.role}</span></td>
                  <td>{c.orders}</td><td><b>{money(c.spent)}</b></td>
                  <td><span className={`pill ${c.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{c.active ? "Active" : "Disabled"}</span></td>
                  <td>{c.role !== "admin" && <button onClick={async () => { await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ res: "customer-toggle", id: c.id, active: !c.active }) }); toast("Updated"); load(); }} className="rounded-lg bg-[#f3e6cc] px-3 py-1.5 text-xs font-bold">{c.active ? "Disable" : "Enable"}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "content" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <p className="font-serif text-lg font-bold">Promotional Banners</p>
            <div className="mt-3 space-y-2">{content.banners?.map((b: any) => (<div key={b.id} className="flex items-center gap-3 rounded-xl border border-[#ecdcb9] p-3 text-sm"><span className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-[#f6ead2]"><SafeImg src={b.image} alt={b.title} sizes="80px" className="object-cover" /></span><span className="flex-1"><b>{b.title}</b><br /><span className="text-xs text-stone-400">{b.subtitle}</span></span><button onClick={async () => { await fetch("/api/admin?res=banner&id=" + b.id, { method: "DELETE", credentials: "include" }); toast("Deleted"); load(); }} className="text-red-600"><Trash2 size={15} /></button></div>))}</div>
          </div>
          <div className="card p-5">
            <p className="font-serif text-lg font-bold">Site Content / Announcements</p>
            <div className="mt-3 space-y-2">{content.content?.map((c: any) => (<div key={c.id} className="rounded-xl border border-[#ecdcb9] p-3 text-sm"><b className="font-mono text-xs">{c.key}</b><p className="mt-1">{c.value}</p></div>))}</div>
            <p className="mt-3 text-xs text-stone-400">Featured & bestsellers are managed from the Products tab (★/🔥 flags) and reflect instantly on the homepage.</p>
          </div>
        </div>
      )}

      {/* PRODUCT MODAL */}
      {showP && editP && (
        <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-[22px] bg-[#fffaf0] p-6">
            <p className="font-serif text-xl font-bold">{editP.id ? "Edit Product" : "Add Product"} <span className="text-xs font-normal text-stone-400">— changes go live instantly</span></p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><p className="label">Name</p><input value={editP.name} onChange={(e) => setEditP({ ...editP, name: e.target.value })} className="input" /></div>
              <div><p className="label">Price ₹</p><input type="number" value={editP.price} onChange={(e) => setEditP({ ...editP, price: e.target.value })} className="input" /></div>
              <div><p className="label">Compare Price ₹</p><input type="number" value={editP.comparePrice || ""} onChange={(e) => setEditP({ ...editP, comparePrice: e.target.value })} className="input" /></div>
              <div><p className="label">SKU</p><input value={editP.sku} onChange={(e) => setEditP({ ...editP, sku: e.target.value })} className="input" /></div>
              <div><p className="label">Stock Qty</p><input type="number" value={editP.stockQuantity} onChange={(e) => setEditP({ ...editP, stockQuantity: e.target.value })} className="input" /></div>
              <div><p className="label">Brand</p><input value={editP.brand} onChange={(e) => setEditP({ ...editP, brand: e.target.value })} className="input" /></div>
              <div><p className="label">Cord Count</p><input type="number" value={editP.cordCount} onChange={(e) => setEditP({ ...editP, cordCount: e.target.value })} className="input" /></div>
              <div><p className="label">Category</p><select value={editP.categoryId || ""} onChange={(e) => setEditP({ ...editP, categoryId: e.target.value })} className="input">{cats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></div>
              <div><p className="label">Stock Status</p><select value={editP.stockStatus || "in_stock"} onChange={(e) => setEditP({ ...editP, stockStatus: e.target.value })} className="input"><option value="in_stock">In Stock</option><option value="out_of_stock">Out of Stock</option></select></div>
              <div className="sm:col-span-2"><p className="label">Image URLs (one per line)</p><textarea value={typeof editP.images === "string" ? editP.images : (editP.images || []).join("\n")} onChange={(e) => setEditP({ ...editP, images: e.target.value })} className="input min-h-20 font-mono text-xs" placeholder="https://…" /></div>
              <div className="sm:col-span-2"><p className="label">Description</p><textarea value={editP.description || ""} onChange={(e) => setEditP({ ...editP, description: e.target.value })} className="input min-h-20" /></div>
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={!!editP.featured} onChange={(e) => setEditP({ ...editP, featured: e.target.checked })} /> Featured</label>
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={!!editP.bestseller} onChange={(e) => setEditP({ ...editP, bestseller: e.target.checked })} /> Bestseller</label>
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={editP.active !== false} onChange={(e) => setEditP({ ...editP, active: e.target.checked })} /> Active</label>
            </div>
            <div className="mt-4 flex gap-2"><button onClick={() => { setShowP(false); setEditP(null); }} className="btn-ghost flex-1">Cancel</button><button onClick={saveProduct} disabled={busy} className="btn-primary flex-1 disabled:opacity-60">{busy ? "Saving…" : "Save Product"}</button></div>
          </div>
        </div>
      )}

      {/* CATEGORY MODAL */}
      {showC && editC && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-[22px] bg-[#fffaf0] p-6">
            <p className="font-serif text-xl font-bold">{editC.id ? "Edit" : "Add"} Category</p>
            <p className="label mt-4">Name</p><input value={editC.name} onChange={(e) => setEditC({ ...editC, name: e.target.value })} className="input" />
            <p className="label mt-3">Description</p><input value={editC.description || ""} onChange={(e) => setEditC({ ...editC, description: e.target.value })} className="input" />
            <p className="label mt-3">Image URL</p><input value={editC.image || ""} onChange={(e) => setEditC({ ...editC, image: e.target.value })} className="input" />
            <label className="mt-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={editC.active !== false} onChange={(e) => setEditC({ ...editC, active: e.target.checked })} /> Active</label>
            <div className="mt-4 flex gap-2"><button onClick={() => { setShowC(false); setEditC(null); }} className="btn-ghost flex-1">Cancel</button><button onClick={saveCat} className="btn-primary flex-1">Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
