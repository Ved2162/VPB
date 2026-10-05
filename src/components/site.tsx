"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShoppingBag, Search, Menu, X, User, Star, Plus, Minus, Trash2, AtSign, Phone, Mail, MapPin, Truck, ShieldCheck, BadgeCheck, ChevronRight, Heart, Eye, ArrowRight } from "lucide-react";
import { useCart, useAuth, useToast } from "@/lib/store";
import { money, INSTAGRAM_URL } from "@/lib/data";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" aria-label="VPB — Verai Patang Bhandar" className="block shrink-0">
      <img
        src={light ? "/images/vpb-logo-light.svg" : "/images/vpb-logo.svg"}
        alt="VPB — Verai Patang Bhandar"
        width={158}
        height={44}
        className="h-8 w-auto max-w-[136px] select-none min-[380px]:h-10 min-[380px]:max-w-[160px] sm:h-12 sm:max-w-[180px]"
      />
    </Link>
  );
}

export function SafeImg({ src, alt, className, sizes, priority }: { src?: string | null; alt?: string; className?: string; sizes?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  const imageSrc = failed || !src ? "/images/manjha/m01.png" : src;
  return (
    <img
      src={imageSrc}
      alt={alt || "VPB — Verai Patang Bhandar"}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => { if (!failed) setFailed(true); }}
      className={`absolute inset-0 h-full w-full ${className || "object-cover"}`}
    />
  );
}

export function Navbar() {
  const { count, setOpen } = useCart();
  const { me } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 24);
    f(); window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  useEffect(() => setMenu(false), [path]);
  const links = [["Shop", "/shop"], ["Categories", "/shop"], ["About VPB", "/about"], ["Craftsmanship", "/craftsmanship"], ["Contact", "/contact"]];
  return (
    <>
      <div className="bg-[#1c0f0a] text-center text-[12px] font-medium tracking-wide text-[#f0d9a8]">
        <p className="mx-auto max-w-6xl px-4 py-2">100% Pure Cotton Bareilly Manjha &nbsp;•&nbsp; Flat ₹200 OFF above ₹6000 &nbsp;•&nbsp; Ships across India in 4–6 days</p>
      </div>
      <header className={`sticky top-0 z-[80] transition-all duration-300 ${scrolled ? "bg-[#fffaf0]/92 shadow-[0_10px_30px_rgba(43,20,13,.12)] backdrop-blur-xl" : "bg-[#fffaf0]"}`}>
        <div className={`mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 transition-all sm:px-6 ${scrolled ? "py-2.5" : "py-4"}`}>
          <Logo />
          <nav className="hidden items-center gap-7 lg:flex">
            {links.map(([l, h]) => (
              <Link key={l} href={h} className="group relative text-[14px] font-semibold text-[#3a2118]">
                {l}
                <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-[#7a1f1f] transition-all duration-300 group-hover:w-full" />
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <form onSubmit={(e) => { e.preventDefault(); router.push("/shop?q=" + encodeURIComponent(q)); }} className="hidden items-center overflow-hidden rounded-full border border-[#e7d6b8] bg-white md:flex">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search manjha, kites…" className="w-44 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-stone-400 lg:w-52" />
              <button className="grid h-9 w-9 place-items-center bg-[#7a1f1f] text-[#f7ead7]"><Search size={16} /></button>
            </form>
            <Link href={me ? "/account" : "/login"} className="grid h-10 w-10 place-items-center rounded-full border border-[#e7d6b8] bg-white text-[#3a2118] transition hover:border-[#7a1f1f] hover:text-[#7a1f1f]" aria-label="Account"><User size={18} /></Link>
            <button onClick={() => setOpen(true)} className="relative grid h-10 w-10 place-items-center rounded-full bg-[#1c0f0a] text-[#f7ead7] transition hover:bg-[#7a1f1f]" aria-label="Cart">
              <ShoppingBag size={18} />
              {count > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#c9a24b] px-1 text-[11px] font-bold text-[#1c0f0a]">{count}</span>}
            </button>
            <button onClick={() => setMenu(!menu)} className="grid h-10 w-10 place-items-center rounded-full border border-[#e7d6b8] bg-white lg:hidden" aria-label="Menu">{menu ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </div>
        <div className={`overflow-hidden transition-all duration-300 lg:hidden ${menu ? "max-h-[480px]" : "max-h-0"}`}>
          <div className="space-y-1 border-t border-[#efe0c3] bg-[#fffaf0] px-4 py-4">
            <form onSubmit={(e) => { e.preventDefault(); setMenu(false); router.push("/shop?q=" + encodeURIComponent(q)); }} className="mb-3 flex items-center overflow-hidden rounded-full border border-[#e7d6b8] bg-white md:hidden">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full bg-transparent px-4 py-2.5 text-sm outline-none" />
              <button className="grid h-10 w-12 place-items-center bg-[#7a1f1f] text-white"><Search size={16} /></button>
            </form>
            {[["Home", "/"], ["Shop", "/shop"], ["About VPB", "/about"], ["Craftsmanship", "/craftsmanship"], ["Track Order", "/track-order"], ["Contact", "/contact"], [me ? "My Account" : "Login", me ? "/account" : "/login"]].map(([l, h]) => (
              <Link key={l} href={h} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-[15px] font-semibold text-[#3a2118] hover:bg-[#f6ead2]">{l}<ChevronRight size={16} className="text-[#c9a24b]" /></Link>
            ))}
          </div>
        </div>
      </header>
    </>
  );
}

export function CartDrawer() {
  const { lines, open, setOpen, setQty, remove, subtotal } = useCart();
  const ship = subtotal >= 6000 ? 0 : subtotal === 0 ? 0 : 99;
  return (
    <>
      <div onClick={() => setOpen(false)} className={`fixed inset-0 z-[90] bg-black/45 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside className={`fixed right-0 top-0 z-[95] flex h-full w-full max-w-md flex-col bg-[#fffaf0] shadow-2xl transition-transform duration-400 ease-[cubic-bezier(.22,1,.36,1)] ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-[#efe0c3] px-5 py-4">
          <h3 className="font-serif text-lg font-bold text-[#2b140d]">Your Cart ({lines.reduce((a, l) => a + l.qty, 0)})</h3>
          <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-[#f3e6cc]"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div><ShoppingBag size={44} className="mx-auto text-[#c9a24b]" /><p className="mt-3 font-serif text-lg font-bold">Cart is empty</p><p className="text-sm text-stone-500">Add some premium manjha to get started.</p><button onClick={() => setOpen(false)} className="btn-primary mt-4">Continue Shopping</button></div>
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((l) => (
                <div key={l.id} className="flex gap-3 rounded-2xl border border-[#eee0c2] bg-white p-3">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#f6ead2]"><SafeImg src={l.image} alt={l.name} sizes="80px" className="object-cover" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#2b140d]">{l.name}</p>
                    <p className="text-sm font-bold text-[#7a1f1f]">{money(l.price)} <span className="font-normal text-stone-400 line-through">{l.comparePrice ? money(l.comparePrice) : ""}</span></p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 rounded-full border border-[#e7d6b8] px-1 py-0.5">
                        <button onClick={() => setQty(l.id, l.qty - 1)} className="grid h-6 w-6 place-items-center rounded-full hover:bg-[#f3e6cc]"><Minus size={13} /></button>
                        <span className="text-sm font-bold">{l.qty}</span>
                        <button onClick={() => setQty(l.id, l.qty + 1)} className="grid h-6 w-6 place-items-center rounded-full hover:bg-[#f3e6cc]"><Plus size={13} /></button>
                      </div>
                      <button onClick={() => remove(l.id)} className="text-stone-400 hover:text-red-700"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {lines.length > 0 && (
          <div className="border-t border-[#efe0c3] bg-white px-5 py-4">
            <div className="flex justify-between text-sm"><span className="text-stone-500">Subtotal</span><span className="font-bold">{money(subtotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-stone-500">Shipping</span><span className="font-bold">{ship === 0 ? "FREE" : money(ship)}</span></div>
            <div className="mt-1 flex justify-between border-t border-dashed border-[#e7d6b8] pt-2 font-serif text-lg font-bold"><span>Total</span><span className="text-[#7a1f1f]">{money(subtotal + ship)}</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href="/cart" onClick={() => setOpen(false)} className="btn-ghost text-center">View Cart</Link>
              <Link href="/checkout" onClick={() => setOpen(false)} className="btn-primary text-center">Checkout</Link>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

export function Stars({ v = 4.5, size = 14 }: { v?: number | string; size?: number }) {
  const n = Number(v) || 0;
  return <span className="inline-flex items-center gap-0.5">{[1, 2, 3, 4, 5].map((i) => (<Star key={i} size={size} className={i <= Math.round(n) ? "fill-[#c9a24b] text-[#c9a24b]" : "text-stone-300"} />))}</span>;
}

export function ProductCard({ p }: { p: any }) {
  const { add } = useCart();
  const { toast } = useToast();
  const img = p.images?.[0] || "/images/manjha/m01.png";
  const img2 = p.images?.[1] || img;
  const off = p.comparePrice && p.comparePrice > p.price ? Math.round((1 - p.price / p.comparePrice) * 100) : 0;
  const out = p.stockStatus === "out_of_stock" || p.stockQuantity <= 0;
  return (
    <div className="reveal group relative overflow-hidden rounded-[18px] border border-[#ecdcb9] bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(43,20,13,.14)]">
      <Link href={`/product/${p.slug}`} className="relative block aspect-[4/4.4] overflow-hidden bg-[#f6ead2]">
        <SafeImg src={img} alt={p.name} sizes="(max-width:768px) 50vw, 25vw" className="object-cover transition-all duration-700 group-hover:scale-[1.06] group-hover:opacity-0" />
        <SafeImg src={img2} alt={p.name} sizes="(max-width:768px) 50vw, 25vw" className="object-cover opacity-0 transition-all duration-700 group-hover:scale-[1.06] group-hover:opacity-100" />
        {off > 0 && <span className="absolute left-3 top-3 rounded-full bg-[#7a1f1f] px-2.5 py-1 text-[11px] font-bold text-[#f7ead7]">-{off}%</span>}
        {p.bestseller && <span className="absolute right-3 top-3 rounded-full bg-[#1c0f0a] px-2.5 py-1 text-[11px] font-bold text-[#f0d9a8]">Bestseller</span>}
        {out && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1.5 text-center text-xs font-bold uppercase tracking-widest text-white">Out of stock</span>}
        <span className="absolute bottom-3 right-3 grid h-9 w-9 translate-y-2 place-items-center rounded-full bg-white opacity-0 shadow-lg transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"><Eye size={16} /></span>
      </Link>
      <div className="p-3.5 sm:p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a07c2c]">{p.brand || "VPB"} {p.cordCount ? `• ${p.cordCount} Cord` : ""}</p>
        <Link href={`/product/${p.slug}`} className="mt-0.5 line-clamp-1 font-serif text-[16px] font-bold text-[#2b140d] hover:text-[#7a1f1f]">{p.name}</Link>
        <div className="mt-1 flex items-center gap-1.5"><Stars v={p.rating} /><span className="text-xs text-stone-500">({p.reviewCount || 0})</span></div>
        <div className="mt-1.5 flex items-baseline gap-2"><span className="text-[17px] font-extrabold text-[#2b140d]">{money(p.price)}</span>{p.comparePrice > p.price && <span className="text-sm text-stone-400 line-through">{money(p.comparePrice)}</span>}</div>
        <button disabled={out} onClick={() => { add({ id: p.id, slug: p.slug, name: p.name, price: p.price, comparePrice: p.comparePrice, image: img, stock: p.stockQuantity }, 1); toast(`${p.name} added to cart`); }} className="btn-primary mt-3 w-full !py-2.5 text-[13px] disabled:opacity-40">{out ? "Out of Stock" : "Add to Cart"}</button>
      </div>
    </div>
  );
}

export function SectionHead({ kicker, title, sub, center = true }: { kicker: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={`reveal ${center ? "mx-auto text-center" : ""} max-w-2xl`}>
      <p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#7a1f1f]">— {kicker} —</p>
      <h2 className="mt-2 font-serif text-[clamp(1.7rem,3.6vw,2.6rem)] font-bold leading-tight text-[#2b140d]">{title}</h2>
      {sub && <p className="mt-2 text-[15px] leading-relaxed text-stone-600">{sub}</p>}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-[#170c07] text-[#e9d5ae]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo light />
          <p className="mt-4 text-sm leading-relaxed text-[#c9b183]">Verai Patang Bhandar — premium Bareilly manjha, hand-crafted by master karigars. Pure cotton, sharp finish, honest pricing.</p>
          <a href={INSTAGRAM_URL} target="_blank" className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#c9a24b]/40 px-4 py-2 text-sm font-bold text-[#f0d9a8] transition hover:bg-[#7a1f1f]"><AtSign size={16} /> @verai_patang_bhandar</a>
        </div>
        <div>
          <h4 className="font-serif text-lg font-bold text-[#f7ead7]">Shop</h4>
          <ul className="mt-3 space-y-2 text-sm">
            {[["All Products", "/shop"], ["6 Cord", "/shop?cord=6"], ["9 Cord", "/shop?cord=9"], ["12 Cord", "/shop?cord=12"], ["Premium Manjha", "/shop?cat=premium-manjha"], ["Kites", "/shop?cat=kites"]].map(([l, h]) => (<li key={l}><Link href={h} className="hover:text-white">{l}</Link></li>))}
          </ul>
        </div>
        <div>
          <h4 className="font-serif text-lg font-bold text-[#f7ead7]">Support</h4>
          <ul className="mt-3 space-y-2 text-sm">
            {[["Track Order", "/track-order"], ["My Account", "/account"], ["Cart", "/cart"], ["Checkout", "/checkout"], ["About VPB", "/about"], ["Contact", "/contact"]].map(([l, h]) => (<li key={l}><Link href={h} className="hover:text-white">{l}</Link></li>))}
          </ul>
        </div>
        <div>
          <h4 className="font-serif text-lg font-bold text-[#f7ead7]">Contact</h4>
          <ul className="mt-3 space-y-2.5 text-sm">
            <li className="flex gap-2"><Phone size={15} className="mt-0.5 text-[#c9a24b]" /> +91 98765 43210</li>
            <li className="flex gap-2"><Mail size={15} className="mt-0.5 text-[#c9a24b]" /> care@vpbmanjha.in</li>
            <li className="flex gap-2"><MapPin size={15} className="mt-0.5 text-[#c9a24b]" /> Bareilly, Uttar Pradesh, India</li>
            <li className="flex gap-2"><Truck size={15} className="mt-0.5 text-[#c9a24b]" /> Ships across India • 4–6 days</li>
          </ul>
          <div className="mt-3 flex items-center gap-2 text-xs text-[#c9b183]"><ShieldCheck size={14} /> Secure checkout <BadgeCheck size={14} /> Genuine VPB</div>
        </div>
      </div>
      <div className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-[#a98f5f] sm:flex-row"><p>© 2026 VPB — Verai Patang Bhandar. All rights reserved.</p><p>Pure Cotton • Bareilly Craft • Pan-India Delivery</p></div></div>
    </footer>
  );
}

export function RevealInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // If IntersectionObserver is unavailable, never leave content invisible.
    if (typeof IntersectionObserver === "undefined") {
      document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.1, rootMargin: "0px 0px -5% 0px" }
    );

    const observe = (root: ParentNode) => {
      const list = root.querySelectorAll ? root.querySelectorAll(".reveal") : [];
      list.forEach((el) => { if (!el.classList.contains("in")) io.observe(el); });
      if ((root as Element).classList?.contains?.("reveal") && !(root as Element).classList.contains("in")) {
        io.observe(root as Element);
      }
    };

    observe(document);

    // Catch client-fetched content (shop/product cards) added after mount.
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          observe(node as Element);
          (node as Element).querySelectorAll?.(".reveal").forEach((el) => { if (!el.classList.contains("in")) io.observe(el); });
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Safety net: nothing may remain invisible (e.g. observer missed a node).
    const failsafe = window.setTimeout(() => {
      document.querySelectorAll(".reveal:not(.in)").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight + 200) el.classList.add("in");
      });
    }, 1500);

    return () => { io.disconnect(); mo.disconnect(); window.clearTimeout(failsafe); };
  }, []);
  return null;
}

export function TrustBar() {
  const items = [[Truck, "Pan-India Shipping", "4–6 working days"], [ShieldCheck, "100% Genuine VPB", "Pure cotton manjha"], [BadgeCheck, "Quality Tested", "Every reel checked"], [Phone, "WhatsApp Support", "+91 98765 43210"]];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(([Icon, t, s]: any) => (
        <div key={t} className="flex items-center gap-3 rounded-2xl border border-[#ecdcb9] bg-white px-4 py-3.5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#7a1f1f]/10 text-[#7a1f1f]"><Icon size={18} /></span><span><span className="block text-sm font-bold text-[#2b140d]">{t}</span><span className="block text-xs text-stone-500">{s}</span></span></div>
      ))}
    </div>
  );
}

export function WishlistBtn({ id }: { id: string }) {
  const { toast } = useToast();
  const [on, setOn] = useState(false);
  useEffect(() => { try { setOn((JSON.parse(localStorage.getItem("vpb_wish") || "[]") as string[]).includes(id)); } catch {} }, [id]);
  return (
    <button aria-label="Wishlist" onClick={() => {
      try {
        const cur: string[] = JSON.parse(localStorage.getItem("vpb_wish") || "[]");
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        localStorage.setItem("vpb_wish", JSON.stringify(next)); setOn(!on);
        toast(!on ? "Added to wishlist" : "Removed from wishlist");
      } catch {}
    }} className={`grid h-10 w-10 place-items-center rounded-full border transition ${on ? "border-[#7a1f1f] bg-[#7a1f1f] text-white" : "border-[#e7d6b8] bg-white text-[#3a2118]"}`}>
      <Heart size={17} className={on ? "fill-current" : ""} />
    </button>
  );
}
export function CtaBand() {
  return (
    <section className="relative overflow-hidden rounded-[26px] bg-[#1c0f0a] px-6 py-14 text-center sm:px-12">
      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-[#7a1f1f]/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-[#c9a24b]/25 blur-3xl" />
      <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#c9a24b]">Uttarayan Ready</p>
      <h3 className="mx-auto mt-2 max-w-2xl font-serif text-[clamp(1.6rem,4vw,2.6rem)] font-bold leading-tight text-[#f7ead7]">Fly sharper. Fly longer. Fly VPB.</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-[#c9b183]">Tournament-grade Bareilly manjha, shipped to your terrace in days.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/shop" className="btn-gold">Shop Collection <ArrowRight size={16} /></Link>
        <Link href="/craftsmanship" className="rounded-full border border-[#c9a24b]/50 px-6 py-3 text-sm font-bold text-[#f0d9a8] hover:bg-white/10">Our Craft</Link>
      </div>
    </section>
  );
}
