"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { ProductCard } from "@/components/site";

function ShopInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState(sp.get("q") || "");
  const [cat, setCat] = useState(sp.get("cat") || "");
  const [cord, setCord] = useState(sp.get("cord") || "");
  const [sort, setSort] = useState("featured");
  const [tag, setTag] = useState(sp.get("tag") || "");
  const [avail, setAvail] = useState("");
  const [maxP, setMaxP] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [sugg, setSugg] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((j) => setCats(j.categories || [])).catch(() => {});
  }, []);

  const fetchProducts = async () => {
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (cat) p.set("cat", cat);
      if (cord) p.set("cord", cord);
      if (sort) p.set("sort", sort);
      if (tag) p.set("tag", tag);
      if (avail) p.set("avail", avail);
      if (maxP) p.set("max", maxP);
      const r = await fetch("/api/products?" + p.toString());
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to load");
      setProducts(j.products);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); // eslint-disable-next-line
  }, [cat, cord, sort, tag, avail]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length >= 2) {
        fetch("/api/products?q=" + encodeURIComponent(q) + "&limit=5").then((r) => r.json()).then((j) => setSugg(j.products || [])).catch(() => {});
      } else setSugg([]);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const clearAll = () => { setQ(""); setCat(""); setCord(""); setTag(""); setAvail(""); setMaxP(""); setSort("featured"); router.push("/shop"); };

  const filters = (
    <div className="space-y-6">
      <div>
        <p className="label">Category</p>
        <div className="space-y-1.5">
          <button onClick={() => setCat("")} className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${!cat ? "bg-[#7a1f1f] text-white" : "hover:bg-[#f3e6cc]"}`}>All Categories</button>
          {cats.map((c) => (
            <button key={c.id} onClick={() => setCat(c.slug)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold ${cat === c.slug ? "bg-[#7a1f1f] text-white" : "hover:bg-[#f3e6cc]"}`}>{c.name}<span className="text-xs opacity-70">{c.count}</span></button>
          ))}
        </div>
      </div>
      <div>
        <p className="label">Cord Count</p>
        <div className="flex flex-wrap gap-2">
          {["", "6", "9", "12", "16"].map((c) => (
            <button key={c} onClick={() => setCord(c)} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${cord === c ? "border-[#7a1f1f] bg-[#7a1f1f] text-white" : "border-[#e7d6b8] bg-white"}`}>{c === "" ? "All" : c + " Cord"}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="label">Max Price (₹)</p>
        <div className="flex gap-2">
          <input value={maxP} onChange={(e) => setMaxP(e.target.value)} placeholder="e.g. 3000" type="number" className="input" />
          <button onClick={fetchProducts} className="btn-ghost !px-4 !py-2 text-[13px]">Go</button>
        </div>
      </div>
      <div>
        <p className="label">Collections</p>
        <div className="flex flex-wrap gap-2">
          {[["", "All"], ["featured", "Featured"], ["bestseller", "Bestseller"]].map(([v, l]) => (
            <button key={v} onClick={() => setTag(v)} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${tag === v ? "border-[#7a1f1f] bg-[#7a1f1f] text-white" : "border-[#e7d6b8] bg-white"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="label">Availability</p>
        <div className="flex flex-wrap gap-2">
          {[["", "All"], ["in", "In Stock"], ["out", "Out of Stock"]].map(([v, l]) => (
            <button key={v} onClick={() => setAvail(v)} className={`rounded-full border px-4 py-1.5 text-sm font-bold ${avail === v ? "border-[#7a1f1f] bg-[#7a1f1f] text-white" : "border-[#e7d6b8] bg-white"}`}>{l}</button>
          ))}
        </div>
      </div>
      <button onClick={clearAll} className="text-sm font-bold text-[#7a1f1f] underline">Clear all filters</button>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#7a1f1f]">VPB Shop</p>
      <h1 className="mt-1 font-serif text-[clamp(1.8rem,4vw,2.8rem)] font-bold">Shop Premium Manjha & Kites</h1>
      <div className="relative mt-5 max-w-xl">
        <div className="flex items-center overflow-hidden rounded-full border-2 border-[#e7d6b8] bg-white focus-within:border-[#7a1f1f]">
          <Search size={18} className="ml-4 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetchProducts()} placeholder="Search Adnan, Black Panther, 9 cord, SKU…" className="w-full bg-transparent px-3 py-3 text-[15px] outline-none" />
          {q && <button onClick={() => { setQ(""); setSugg([]); }} className="mr-2 rounded-full p-1 hover:bg-stone-100"><X size={16} /></button>}
          <button onClick={fetchProducts} className="m-1 rounded-full bg-[#7a1f1f] px-6 py-2.5 text-sm font-bold text-white">Search</button>
        </div>
        {sugg.length > 0 && (
          <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-[#ecdcb9] bg-white shadow-2xl">
            {sugg.map((s) => (
              <button key={s.id} onClick={() => (window.location.href = "/product/" + s.slug)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-[#fff4de]">
                <span><b>{s.name}</b> <span className="text-stone-400">• {s.brand}</span></span><span className="font-bold text-[#7a1f1f]">₹{s.price.toLocaleString("en-IN")}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button onClick={() => setDrawer(true)} className="btn-ghost !py-2.5 text-[13px] lg:hidden"><SlidersHorizontal size={15} /> Filters</button>
        <p className="text-sm text-stone-500">{loading ? "Loading…" : `${products.length} products`}</p>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-full border border-[#e7d6b8] bg-white px-4 py-2.5 text-sm font-semibold outline-none">
          <option value="featured">Sort: Featured</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="rating">Top Rated</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block"><div className="card sticky top-28 p-5">{filters}</div></aside>
        <div>
          {loading ? (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => (<div key={i} className="skel aspect-[4/5]" />))}</div>
          ) : error ? (
            <div className="card p-10 text-center"><p className="font-serif text-xl font-bold">Couldn't load products</p><p className="mt-1 text-sm text-stone-500">{error}</p><button onClick={fetchProducts} className="btn-primary mt-4">Retry</button></div>
          ) : products.length === 0 ? (
            <div className="card p-10 text-center"><p className="font-serif text-xl font-bold">No products found</p><p className="mt-1 text-sm text-stone-500">Try a different search or clear filters.</p><button onClick={clearAll} className="btn-primary mt-4">Clear Filters</button></div>
          ) : (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">{products.map((p) => (<ProductCard key={p.id} p={p} />))}</div>
          )}
        </div>
      </div>

      <div onClick={() => setDrawer(false)} className={`fixed inset-0 z-[90] bg-black/45 transition lg:hidden ${drawer ? "" : "pointer-events-none opacity-0"}`} />
      <div className={`fixed bottom-0 left-0 right-0 z-[95] max-h-[85vh] overflow-y-auto rounded-t-[24px] bg-[#fffaf0] p-6 transition-transform duration-300 lg:hidden ${drawer ? "translate-y-0" : "translate-y-full"}`}>
        <div className="mb-4 flex items-center justify-between"><p className="font-serif text-lg font-bold">Filters</p><button onClick={() => setDrawer(false)}><X size={20} /></button></div>
        {filters}
        <button onClick={() => { setDrawer(false); fetchProducts(); }} className="btn-primary mt-6 w-full">Show Results</button>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return <Suspense fallback={<div className="p-10 text-center">Loading shop…</div>}><ShopInner /></Suspense>;
}
