import Link from "next/link";
import { ArrowRight, AtSign, ShieldCheck, Star, Truck, BadgeCheck, Quote } from "lucide-react";
import { ProductCard, SectionHead, TrustBar, Stars, CtaBand, SafeImg } from "@/components/site";
import { HERO_VIDEO, HERO_POSTER, GALLERY, CRAFT_IMAGES, INSTAGRAM_URL } from "@/lib/data";
import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getData() {
  try {
    const feat = await db.select().from(products).where(eq(products.active, true));
    const cats = await db.select().from(categories);
    return { products: feat, categories: cats.filter((c) => c.active) };
  } catch {
    return { products: [], categories: [] };
  }
}

export default async function Home() {
  const { products: all, categories: cats } = await getData();
  const best = all.filter((p: any) => p.bestseller).slice(0, 4);
  const feat = all.filter((p: any) => p.featured).slice(0, 8);
  const showBest = (best.length ? best : all.slice(0, 4)) as any[];
  const showFeat = (feat.length ? feat : all.slice(0, 8)) as any[];

  return (
    <div>
      {/* HERO */}
      <section className="relative flex min-h-[92vh] items-end overflow-hidden bg-[#170c07] sm:items-center">
        <video autoPlay muted loop playsInline poster={HERO_POSTER} className="absolute inset-0 h-full w-full object-cover">
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-[#170c07] via-[#170c07]/45 to-[#170c07]/25" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#170c07]/70 via-transparent to-transparent" />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-28 sm:px-6 sm:pb-24">
          <div className="max-w-2xl">
            <p className="hero-fade hero-fade-1 inline-flex items-center gap-2 rounded-full border border-[#c9a24b]/50 bg-white/10 px-4 py-1.5 text-[12px] font-bold uppercase tracking-[0.24em] text-[#f0d9a8] backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c9a24b]" /> Bareilly • Since Generations
            </p>
            <h1 className="hero-fade hero-fade-2 mt-5 font-serif text-[clamp(2.4rem,6.5vw,4.6rem)] font-black leading-[1.04] text-[#fdf6e7]">
              The Sharpest Thread<br />Bareilly Ever Made.
            </h1>
            <p className="hero-fade hero-fade-2 mt-4 max-w-xl text-[16px] leading-relaxed text-[#e9d5ae]">
              VPB — Verai Patang Bhandar. 100% pure cotton manjha, hand-rubbed by master karigars, coated with authentic Bareilly manjha paste for tournament pench. Trusted on terraces across India.
            </p>
            <div className="hero-fade hero-fade-3 mt-7 flex flex-wrap gap-3">
              <Link href="/shop" className="btn-gold !px-8 !py-3.5 !text-[15px]">Shop Collection <ArrowRight size={17} /></Link>
              <Link href="/craftsmanship" className="inline-flex items-center gap-2 rounded-full border border-white/30 px-8 py-3.5 text-[15px] font-bold text-white backdrop-blur transition hover:bg-white/15">Explore VPB</Link>
            </div>
            <div className="hero-fade hero-fade-3 mt-8 flex flex-wrap items-center gap-x-7 gap-y-2 text-[13px] font-semibold text-[#e9d5ae]">
              <span className="flex items-center gap-1.5"><Star size={14} className="fill-[#c9a24b] text-[#c9a24b]" /> 4.8 — 2,400+ reviews</span>
              <span className="flex items-center gap-1.5"><Truck size={15} /> Pan-India 4–6 days</span>
              <span className="flex items-center gap-1.5"><ShieldCheck size={15} /> 100% Genuine</span>
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="overflow-hidden border-b border-[#ecdcb9] bg-[#7a1f1f] py-2.5 text-[#f0d9a8]">
        <div className="marquee text-[13px] font-bold uppercase tracking-[0.2em]">
          {[0, 1].map((k) => (
            <span key={k} className="flex shrink-0 items-center">
              {["100% Pure Cotton", "Adnan Special", "Black Panther", "Bareilly Craft", "Pan-India Shipping", "Tournament Grade"].map((t) => (
                <span key={t + k} className="mx-6 flex items-center gap-6">{t} <span className="text-[#c9a24b]">✦</span></span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-20 px-4 py-14 sm:px-6 sm:py-20">
        {/* INTRO */}
        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div className="reveal">
            <p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#7a1f1f]">— Verai Patang Bhandar —</p>
            <h2 className="mt-2 font-serif text-[clamp(1.8rem,4vw,2.8rem)] font-bold leading-tight">Three generations.<br />One promise — <em className="text-[#7a1f1f]">sharp, honest manjha.</em></h2>
            <p className="mt-4 leading-relaxed text-stone-600">Every VPB reel starts as pure cotton thread in the gallis of Bareilly — boiled in rice-starch, coated with authentic Bareilly manjha paste, dried in the sun and tested metre by metre. No shortcuts. No mixing. Just the manjha our own family flies.</p>
            <div className="mt-6 grid grid-cols-3 gap-4">
              {[["40+", "Years of craft"], ["2L+", "Reels flown"], ["4.8★", "Avg. rating"]].map(([n, l]) => (
                <div key={l} className="rounded-2xl border border-[#ecdcb9] bg-white px-4 py-4 text-center"><p className="font-serif text-2xl font-black text-[#7a1f1f]">{n}</p><p className="text-xs font-semibold text-stone-500">{l}</p></div>
              ))}
            </div>
            <Link href="/about" className="btn-ghost mt-6">Our Brand Story <ArrowRight size={16} /></Link>
          </div>
          <div className="reveal relative">
            <div className="relative aspect-[4/4.6] w-full overflow-hidden rounded-[24px] shadow-[0_30px_60px_rgba(43,20,13,.2)]">
              <SafeImg src={CRAFT_IMAGES[0]} alt="VPB craftsmanship" sizes="50vw" className="object-cover" />
            </div>
            <div className="absolute -bottom-6 -left-4 hidden w-56 overflow-hidden rounded-2xl border-4 border-[#fffaf0] shadow-xl sm:block">
              <div className="relative aspect-[4/3] w-full"><SafeImg src={CRAFT_IMAGES[2]} alt="Manjha spools" sizes="220px" className="object-cover" /></div>
            </div>
            <div className="absolute -right-3 top-6 rounded-2xl bg-[#1c0f0a] px-5 py-4 text-[#f0d9a8] shadow-xl">
              <p className="font-serif text-xl font-black text-[#f5d67b]">100%</p><p className="text-xs font-bold uppercase tracking-widest">Pure Cotton</p>
            </div>
          </div>
        </section>

        {/* CATEGORIES */}
        <section>
          <SectionHead kicker="Shop by Craft" title="Featured Categories" sub="From everyday 6 cord to limited Heritage 16 cord — pick your weapon." />
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(cats.length ? cats : []).slice(0, 8).map((c: any, i: number) => (
              <Link key={c.id} href={`/shop?cat=${c.slug}`} className="reveal group relative aspect-[4/4.4] overflow-hidden rounded-[20px] bg-[#1c0f0a]" style={{ transitionDelay: `${i * 60}ms` }}>
                <SafeImg src={c.image || CRAFT_IMAGES[i % 3]} alt={c.name} sizes="(max-width:768px) 50vw, 25vw" className="object-cover opacity-90 transition duration-700 group-hover:scale-105 group-hover:opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="font-serif text-lg font-bold text-white">{c.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[13px] font-bold text-[#f0d9a8]">Explore <ArrowRight size={14} className="transition group-hover:translate-x-1" /></p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* BEST SELLERS */}
        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#7a1f1f]">— Most Loved —</p>
              <h2 className="mt-2 font-serif text-[clamp(1.7rem,3.6vw,2.6rem)] font-bold">Best Sellers</h2></div>
            <Link href="/shop?tag=bestseller" className="btn-ghost !py-2.5 text-[13px]">View all <ArrowRight size={15} /></Link>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">{showBest.map((p: any) => (<ProductCard key={p.id} p={p} />))}</div>
        </section>

        {/* CRAFT STORY BAND */}
        <section className="reveal relative overflow-hidden rounded-[26px] bg-[#1c0f0a]">
          <div className="grid lg:grid-cols-2">
            <div className="relative min-h-[320px]">
              <SafeImg src="https://images.pexels.com/photos/12672112/pexels-photo-12672112.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" alt="Manjha making" sizes="50vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#1c0f0a]/60" />
            </div>
            <div className="p-8 sm:p-12">
              <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#c9a24b]">VPB Craftsmanship</p>
              <h3 className="mt-2 font-serif text-[clamp(1.6rem,3.4vw,2.4rem)] font-bold leading-tight text-[#f7ead7]">Manjha is not made.<br />It is <em className="text-[#f5d67b]">prepared</em> — like a ritual.</h3>
              <ul className="mt-5 space-y-3 text-[14px] text-[#d9c49a]">
                {[["01", "Pure cotton, starched & sun-dried"], ["02", "Authentic Bareilly manjha paste, even coating"], ["03", "500-metre quality checks, every reel"]].map(([n, t]) => (
                  <li key={n} className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full border border-[#c9a24b]/40 font-serif text-sm font-bold text-[#f5d67b]">{n}</span>{t}</li>
                ))}
              </ul>
              <Link href="/craftsmanship" className="btn-gold mt-7">Watch the Craft <ArrowRight size={16} /></Link>
            </div>
          </div>
        </section>

        {/* PREMIUM COLLECTION */}
        <section>
          <SectionHead kicker="Signature" title="Premium Collection" sub="Hand-finished, triple-coated, numbered reels for serious flyers." />
          <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">{showFeat.slice(0, 4).map((p: any) => (<ProductCard key={p.id} p={p} />))}</div>
        </section>

        {/* WHY VPB */}
        <section className="rounded-[26px] border border-[#ecdcb9] bg-white p-6 sm:p-10">
          <SectionHead kicker="Why VPB" title="Why Flyers Choose VPB" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[[ShieldCheck, "Pure Cotton Only", "No nylon mix. Lab-consistent cotton base on every reel."], [BadgeCheck, "Tested Every 500m", "Tension, coating and sharpness checked before packing."], [Truck, "Fast, Safe Shipping", "Vacuum-packed reels, shipped in 24h, delivered in 4–6 days."], [Quote, "WhatsApp Support", "Questions about your order? Reach us on WhatsApp anytime — +91 97273 28905."]].map(([Icon, t, s]: any) => (
              <div key={t} className="reveal rounded-2xl bg-[#fffaf0] p-6 text-center ring-1 ring-[#ecdcb9]">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#7a1f1f] text-[#f5d67b]"><Icon size={20} /></span>
                <p className="mt-3 font-serif text-lg font-bold">{t}</p><p className="mt-1 text-sm text-stone-500">{s}</p>
              </div>
            ))}
          </div>
          <div className="mt-8"><TrustBar /></div>
        </section>

        {/* FEATURED PRODUCTS */}
        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#7a1f1f]">— Fresh Stock —</p>
              <h2 className="mt-2 font-serif text-[clamp(1.7rem,3.6vw,2.6rem)] font-bold">Featured Products</h2></div>
            <Link href="/shop" className="btn-ghost !py-2.5 text-[13px]">Shop all <ArrowRight size={15} /></Link>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">{showFeat.map((p: any) => (<ProductCard key={p.id} p={p} />))}</div>
        </section>

        {/* REVIEWS */}
        <section>
          <SectionHead kicker="Social Proof" title="Loved on Terraces Across India" sub="2,400+ verified reviews. 4.8 average. Zero paid reviews." />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[["Rohit S. — Jaipur", "Adnan 9 Cord Special", "Pench hi khatam. Cut 11 kites in one session on Uttarayan. Coating even, no hand cuts. Best manjha I've flown in 10 years."], ["Imran K. — Bareilly", "Black Panther 9 Cord", "Genuine Panther. Dark, aggressive, holds tension beautifully. Delivery to Bareilly in 2 days, packing superb."], ["Mehul P. — Ahmedabad", "Nawab Premium 9 Cord", "Silky release, brutal bite. Worth every rupee. VPB support even helped me pick cord for 15 Aug winds."]].map(([n, pr, t]) => (
              <figure key={n} className="reveal rounded-[20px] border border-[#ecdcb9] bg-white p-6">
                <Stars v={5} /><blockquote className="mt-3 text-[14.5px] leading-relaxed text-stone-700">“{t}”</blockquote>
                <figcaption className="mt-4 border-t border-dashed border-[#e7d6b8] pt-3"><p className="text-sm font-bold">{n}</p><p className="text-xs text-[#7a1f1f]">Verified — {pr}</p></figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* AUTHENTICITY + DELIVERY */}
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="reveal rounded-[22px] bg-[#7a1f1f] p-8 text-[#f7ead7] sm:p-10">
            <ShieldCheck size={30} className="text-[#f5d67b]" />
            <h3 className="mt-3 font-serif text-2xl font-bold">100% Authentic. Every Reel.</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#f0d9a8]">Look for the VPB seal, batch number and karigar stamp on every reel. Scan it on the track-order page to verify genuineness. Duplicates can't copy our finish.</p>
            <Link href="/track-order" className="btn-gold mt-5 !text-[13px]">Verify / Track Order</Link>
          </div>
          <div className="reveal rounded-[22px] border border-[#ecdcb9] bg-white p-8 sm:p-10">
            <Truck size={30} className="text-[#7a1f1f]" />
            <h3 className="mt-3 font-serif text-2xl font-bold">Delivery Highlights</h3>
            <ul className="mt-3 space-y-2 text-sm text-stone-600">
              <li>• Dispatched in 24 hours, vacuum-packed</li>
              <li>• 4–6 working days across India</li>
              <li>• FREE shipping above ₹6000 • Flat ₹200 OFF above ₹6000</li>
              <li>• Live tracking with courier + tracking number</li>
            </ul>
            <Link href="/shop" className="btn-ghost mt-5 !text-[13px]">Start Shopping</Link>
          </div>
        </section>

        {/* INSTAGRAM */}
        <section>
          <SectionHead kicker="Follow VPB" title="From Instagram — @verai_patang_bhandar" sub="Real reels, real manjha, real karigars. This is the VPB world." />
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {GALLERY.map((g, i) => (
              <a key={i} href={INSTAGRAM_URL} target="_blank" className="reveal group relative aspect-square overflow-hidden rounded-2xl" style={{ transitionDelay: `${i * 50}ms` }}>
                <SafeImg src={g.src} alt={g.label} sizes="(max-width:768px) 50vw, 16vw" className="object-cover transition duration-700 group-hover:scale-108" />
                <span className="absolute inset-0 grid place-items-center bg-[#1c0f0a]/0 opacity-0 transition group-hover:bg-[#1c0f0a]/45 group-hover:opacity-100"><AtSign size={22} className="text-white" /></span>
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 text-[11px] font-bold text-white">{g.label}</span>
              </a>
            ))}
          </div>
          <div className="mt-6 text-center"><a href={INSTAGRAM_URL} target="_blank" className="btn-primary">Follow VPB on Instagram <ArrowRight size={16} /></a></div>
        </section>

        <CtaBand />
      </div>
    </div>
  );
}
