"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Zap, Truck, ShieldCheck, MapPin, BadgeCheck } from "lucide-react";
import { ProductCard, Stars, WishlistBtn, SafeImg } from "@/components/site";
import { useCart, useToast, useAuth } from "@/lib/store";
import { money } from "@/lib/data";

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [img, setImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [zoom, setZoom] = useState(false);
  const { add } = useCart();
  const { toast } = useToast();
  const { me } = useAuth();
  const [revForm, setRevForm] = useState({ rating: 5, title: "", review: "" });

  const load = async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/products/" + slug);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Product not found");
      setData(j);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, [slug]);

  if (loading) return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6"><div className="grid gap-8 lg:grid-cols-2"><div className="skel aspect-square" /><div className="space-y-3"><div className="skel h-8 w-3/4" /><div className="skel h-5 w-1/2" /><div className="skel h-12 w-full" /></div></div></div>;
  if (error || !data?.product) return <div className="mx-auto max-w-2xl px-4 py-20 text-center"><p className="font-serif text-2xl font-bold">Product not found</p><p className="text-stone-500">{error}</p><div className="mt-4 flex justify-center gap-2"><button onClick={load} className="btn-ghost">Retry</button><Link href="/shop" className="btn-primary">Back to Shop</Link></div></div>;

  const p = data.product;
  const images = p.images?.length ? p.images : [""];
  const out = p.stockStatus === "out_of_stock" || p.stockQuantity <= 0;
  const off = p.comparePrice > p.price ? Math.round((1 - p.price / p.comparePrice) * 100) : 0;

  const checkPin = async () => {
    setPinMsg("");
    const r = await fetch("/api/extra", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ res: "pincode", pincode: pin }) });
    const j = await r.json();
    setPinMsg(j.ok ? `✓ ${j.eta} to ${pin} • Shipping ${j.charge === 0 ? "FREE" : "₹" + j.charge}` : "✕ " + j.error);
  };

  const submitReview = async () => {
    if (!me) { toast("Login to write a review"); return; }
    const r = await fetch("/api/extra", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ res: "review", productId: p.id, ...revForm }) });
    const j = await r.json();
    if (j.ok) { toast("Review submitted. Thank you!"); setRevForm({ rating: 5, title: "", review: "" }); load(); }
    else toast(j.error || "Failed");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-32 pt-8 sm:px-6 lg:pb-10">
      <p className="text-[13px] text-stone-500"><Link href="/" className="hover:text-[#7a1f1f]">Home</Link> / <Link href="/shop" className="hover:text-[#7a1f1f]">Shop</Link> / <span className="font-semibold text-[#2b140d]">{p.name}</span></p>
      <div className="mt-5 grid gap-10 lg:grid-cols-2">
        <div>
          <div className="relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-[22px] border border-[#ecdcb9] bg-white" onClick={() => setZoom(true)}>
            <SafeImg src={images[img]} alt={p.name} sizes="50vw" priority className="object-cover transition duration-500 hover:scale-[1.04]" />
            {off > 0 && <span className="absolute left-4 top-4 rounded-full bg-[#7a1f1f] px-3 py-1 text-xs font-bold text-white">-{off}% OFF</span>}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            {images.map((s: string, i: number) => (
              <button key={i} onClick={() => setImg(i)} className={`relative aspect-square w-full overflow-hidden rounded-xl border-2 ${img === i ? "border-[#7a1f1f]" : "border-[#ecdcb9]"}`}>
                <SafeImg src={s} alt="" sizes="100px" className="object-cover" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#a07c2c]">{p.brand} {p.cordCount ? `• ${p.cordCount} Cord` : ""}</p>
          <h1 className="mt-1 font-serif text-[clamp(1.6rem,3.6vw,2.5rem)] font-bold leading-tight">{p.name}</h1>
          <div className="mt-2 flex items-center gap-2"><Stars v={p.rating} /><span className="text-sm font-bold">{Number(p.rating).toFixed(1)}</span><span className="text-sm text-stone-400">• {p.reviewCount} reviews • SKU {p.sku}</span></div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="font-serif text-3xl font-black">{money(p.price)}</span>
            {p.comparePrice > p.price && <span className="text-lg text-stone-400 line-through">{money(p.comparePrice)}</span>}
            {off > 0 && <span className="pill bg-green-100 text-green-800">Save {money(p.comparePrice - p.price)}</span>}
          </div>
          <p className={`mt-2 text-sm font-bold ${out ? "text-red-700" : "text-green-700"}`}>{out ? "● Out of Stock" : `● In Stock — only ${p.stockQuantity} reels left`}</p>
          <p className="mt-4 leading-relaxed text-stone-600">{p.description}</p>
          {p.highlights?.length > 0 && (
            <ul className="mt-4 space-y-1.5">{p.highlights.map((h: string, i: number) => (<li key={i} className="flex gap-2 text-sm"><BadgeCheck size={16} className="mt-0.5 shrink-0 text-[#7a1f1f]" />{h}</li>))}</ul>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-full border-2 border-[#e7d6b8] px-2 py-1.5">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[#f3e6cc]"><Minus size={15} /></button>
              <span className="w-6 text-center font-extrabold">{qty}</span>
              <button onClick={() => setQty(Math.min(p.stockQuantity || 99, qty + 1))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[#f3e6cc]"><Plus size={15} /></button>
            </div>
            <WishlistBtn id={p.id} />
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <button disabled={out} onClick={() => { add({ id: p.id, slug: p.slug, name: p.name, price: p.price, comparePrice: p.comparePrice, image: images[0], stock: p.stockQuantity }, qty); toast(`${p.name} added to cart`); }} className="btn-ghost !border-2 !border-[#7a1f1f] !py-3.5 disabled:opacity-40"><ShoppingBag size={17} /> Add to Cart</button>
            <button disabled={out} onClick={() => { add({ id: p.id, slug: p.slug, name: p.name, price: p.price, comparePrice: p.comparePrice, image: images[0], stock: p.stockQuantity }, qty); window.location.href = "/checkout"; }} className="btn-primary !py-3.5 disabled:opacity-40"><Zap size={17} /> Buy Now</button>
          </div>
          <div className="card mt-5 p-4">
            <p className="label"><MapPin size={13} className="mr-1 inline" /> Delivery / Pincode Checker</p>
            <div className="flex gap-2">
              <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="e.g. 243001" maxLength={6} className="input" />
              <button onClick={checkPin} className="btn-ghost shrink-0 !py-2 text-[13px]">Check</button>
            </div>
            {pinMsg && <p className="mt-2 text-sm font-semibold">{pinMsg}</p>}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-stone-500">
              <span className="flex items-center gap-1.5"><Truck size={14} /> 4–6 day delivery</span>
              <span className="flex items-center gap-1.5"><ShieldCheck size={14} /> Genuine VPB seal</span>
            </div>
          </div>
          {p.specs && Object.keys(p.specs).length > 0 && (
            <div className="card mt-4 overflow-hidden">
              <p className="border-b border-[#ecdcb9] bg-[#fff6e3] px-4 py-2.5 font-serif text-[15px] font-bold">Specifications</p>
              <dl>{Object.entries(p.specs).map(([k, v]: any) => (<div key={k} className="flex justify-between gap-4 border-b border-[#f3e8d0] px-4 py-2.5 text-sm last:border-0"><dt className="text-stone-500">{k}</dt><dd className="font-bold">{v}</dd></div>))}</dl>
            </div>
          )}
        </div>
      </div>

      {/* REVIEWS */}
      <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <h3 className="font-serif text-2xl font-bold">Customer Reviews ({data.reviews?.length || 0})</h3>
          <div className="mt-4 space-y-3">
            {(data.reviews || []).length === 0 && <p className="text-sm text-stone-500">No reviews yet. Be the first to review this reel.</p>}
            {(data.reviews || []).map((r: any) => (
              <div key={r.id} className="card p-5"><div className="flex items-center justify-between"><Stars v={r.rating} /><span className="text-xs text-stone-400">{new Date(r.createdAt).toLocaleDateString("en-IN")}</span></div>
                <p className="mt-2 font-bold">{r.title || r.userName}</p><p className="text-sm text-stone-600">{r.review}</p><p className="mt-2 text-xs font-bold text-green-700">✓ Verified Buyer — {r.userName}</p></div>
            ))}
          </div>
        </div>
        <div className="card h-fit p-5">
          <p className="font-serif text-lg font-bold">Write a Review</p>
          {!me && <p className="mt-1 text-sm text-stone-500">Please <Link href="/login" className="font-bold text-[#7a1f1f]">login</Link> to review.</p>}
          <p className="label mt-3">Rating</p>
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => (<button key={i} onClick={() => setRevForm({ ...revForm, rating: i })}>★<span className="sr-only">{i}</span></button>))}
            <span className="ml-1 text-sm font-bold">{revForm.rating}/5 — click stars</span></div>
          <div className="mt-1 flex gap-1">{[1, 2, 3, 4, 5].map((i) => (<button key={i} onClick={() => setRevForm({ ...revForm, rating: i })} className={`text-2xl ${i <= revForm.rating ? "text-[#c9a24b]" : "text-stone-300"}`}>★</button>))}</div>
          <p className="label mt-3">Title</p><input value={revForm.title} onChange={(e) => setRevForm({ ...revForm, title: e.target.value })} className="input" placeholder="Sharp & smooth!" />
          <p className="label mt-3">Review</p><textarea value={revForm.review} onChange={(e) => setRevForm({ ...revForm, review: e.target.value })} className="input min-h-24" placeholder="How was the pench?" />
          <button onClick={submitReview} className="btn-primary mt-3 w-full">Submit Review</button>
        </div>
      </div>

      {data.related?.length > 0 && (
        <div className="mt-14"><h3 className="font-serif text-2xl font-bold">Related Products</h3>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">{data.related.map((r: any) => (<ProductCard key={r.id} p={r} />))}</div></div>
      )}

      {zoom && (
        <div onClick={() => setZoom(false)} className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-6">
          <img src={images[img] || "/images/manjha/m01.png"} alt={p.name} className="max-h-[88vh] w-auto rounded-2xl object-contain" />
        </div>
      )}

      {/* sticky mobile buy bar */}
      <div className="fixed inset-x-0 bottom-0 z-[70] border-t border-[#ecdcb9] bg-white/95 p-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-bold">{p.name}</p><p className="font-serif text-lg font-black text-[#7a1f1f]">{money(p.price)}</p></div>
          <button disabled={out} onClick={() => { add({ id: p.id, slug: p.slug, name: p.name, price: p.price, comparePrice: p.comparePrice, image: images[0], stock: p.stockQuantity }, qty); toast("Added to cart"); }} className="btn-ghost !px-4 !py-2.5 text-[13px]">Add</button>
          <button disabled={out} onClick={() => { add({ id: p.id, slug: p.slug, name: p.name, price: p.price, comparePrice: p.comparePrice, image: images[0], stock: p.stockQuantity }, qty); window.location.href = "/checkout"; }} className="btn-primary !px-5 !py-2.5 text-[13px]">Buy Now</button>
        </div>
      </div>
    </div>
  );
}
