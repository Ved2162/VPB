import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories, products, users, banners, siteContent } from "@/db/schema";
import { hashPassword, slugify } from "@/lib/auth";
import { eq } from "drizzle-orm";

// Real VPB manjha product images (local static files in /public/images/manjha/)
// m01 = black 9-cord 2-reel spool
// m02 = Bareilly Dragon 9-cord 3-reel black
// m03 = Bareilly Dragon Hammer black cylinder
// m04 = Shadab Bhai purple/pink reel
// m05 = Ijaz Beg black reel top view
// m06 = Bareilly Randy red reel
// m07 = purple/blue small reel
// m08 = light blue reel
// m09 = Bareilly Dragon Hammer red 3-reel
// m10 = Ijaz Beg black cylinder side view
// m11 = purple manjha reel
const IMG = {
  // Black / dark manjha reels → 9-cord, 12-cord, Black Panther, premium
  dark:    ["/images/manjha/m01.png", "/images/manjha/m02.png"],
  // Black cylinder reels → Ijaz Beg / Dragon Hammer (heavy cord, special)
  darkCyl: ["/images/manjha/m03.png", "/images/manjha/m10.png"],
  // Red reels → Adnan 9-cord special, Bareilly Randy
  orange:  ["/images/manjha/m09.png", "/images/manjha/m06.png"],
  // Purple / colourful reels → Shadab Bhai, special editions, Gulab
  rainbow: ["/images/manjha/m04.png", "/images/manjha/m11.png"],
  // Purple small + Ijaz Beg → Nawab premium, tournament 6-cord
  tools:   ["/images/manjha/m07.png", "/images/manjha/m05.png"],
  // Light blue reel → 6-cord Gold Classic, Heritage
  blue:    ["/images/manjha/m08.png", "/images/manjha/m01.png"],
  // Kite images — keep pexels (no local kite photos provided)
  kite1: ["https://images.pexels.com/photos/30333344/pexels-photo-30333344.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", "https://images.pexels.com/photos/5005214/pexels-photo-5005214.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
  kite2: ["https://images.pexels.com/photos/30470265/pexels-photo-30470265.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", "https://images.pexels.com/photos/35098545/pexels-photo-35098545.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"],
};

export async function POST() {
  try {
    const catDefs = [
      { name: "6 Cord", slug: "6-cord", description: "Everyday 6 cord Bareilly manjha — perfect balance of sharpness and control for daily flying.", image: IMG.blue[0] },
      { name: "9 Cord", slug: "9-cord", description: "Tournament-favourite 9 cord — extra bite for serious pench.", image: IMG.orange[0] },
      { name: "12 Cord", slug: "12-cord", description: "Heavy 12 cord for big kites and high winds.", image: IMG.dark[0] },
      { name: "Premium Manjha", slug: "premium-manjha", description: "VPB signature premium reels — hand-finished, glass-coated, quality tested.", image: IMG.rainbow[0] },
      { name: "Special Manjha", slug: "special-manjha", description: "Limited special editions — Black Panther, Adnan Special and more.", image: IMG.darkCyl[0] },
      { name: "Kites", slug: "kites", description: "Hand-made designer patangs — Adnan, Bareilly and Delhi styles.", image: IMG.kite1[0] },
      { name: "Accessories", slug: "accessories", description: "Charkhi, saddi, thread wax and kite accessories.", image: IMG.tools[0] },
    ];
    const catIds: Record<string, string> = {};
    for (const c of catDefs) {
      const ex = await db.select().from(categories).where(eq(categories.slug, c.slug));
      if (ex.length) { catIds[c.slug] = ex[0].id; continue; }
      const ins = await db.insert(categories).values({ name: c.name, slug: c.slug, description: c.description, image: c.image, active: true }).returning();
      catIds[c.slug] = ins[0].id;
    }

    const prodDefs = [
      { name: "Adnan 9 Cord Special", cat: "9-cord", brand: "VPB • Adnan", cord: 9, price: 2499, compare: 2999, best: true, feat: true, rating: "4.9", rc: 212, sku: "VPB-ADN-9C", stock: 42, images: IMG.orange, reel: "3 Reel • 6000m", desc: "VPB's flagship Adnan 9 cord — pure cotton base, even glass coating, razor pench. The reel serious flyers ask for by name. Made in Bareilly, finished by VPB karigars." },
      { name: "Black Panther 9 Cord", cat: "special-manjha", brand: "VPB • Black Panther", cord: 9, price: 2799, compare: 3299, best: true, feat: true, rating: "4.8", rc: 164, sku: "VPB-BLK-9C", stock: 35, images: IMG.darkCyl, reel: "3 Reel • 6000m", desc: "Black Panther — dark-coated aggressive 9 cord with brutal cutting power. For experienced hands only. VPB quality-tested every 500m." },
      { name: "VPB Gold Classic 6 Cord", cat: "6-cord", brand: "VPB", cord: 6, price: 1299, compare: 1599, best: true, feat: true, rating: "4.7", rc: 328, sku: "VPB-GLD-6C", stock: 80, images: IMG.blue, reel: "3 Reel • 6000m", desc: "The everyday legend. Smooth, sharp, easy on hands — ideal for daily terrace flying and beginners moving to real Bareilly manjha." },
      { name: "Shahi 12 Cord Heavy", cat: "12-cord", brand: "VPB • Shahi", cord: 12, price: 3499, compare: 3999, best: false, feat: true, rating: "4.8", rc: 96, sku: "VPB-SHH-12C", stock: 28, images: IMG.dark, reel: "3 Reel • 6000m", desc: "Heavy 12 cord for big patangs and strong winds. Thick cotton, deep manjha penetration, unshakeable grip in pench." },
      { name: "Ustad 6 Cord Tournament", cat: "6-cord", brand: "VPB • Ustad", cord: 6, price: 1899, compare: 2199, best: true, feat: false, rating: "4.6", rc: 141, sku: "VPB-UST-6C", stock: 55, images: IMG.tools, reel: "2 Reel • 4000m", desc: "Tournament-tuned 6 cord with fine glass finish. Fast, precise, consistent — trusted in club competitions across UP and Gujarat." },
      { name: "Nawab Premium 9 Cord", cat: "premium-manjha", brand: "VPB • Nawab", cord: 9, price: 3199, compare: 3699, best: false, feat: true, rating: "4.9", rc: 78, sku: "VPB-NWB-9C", stock: 22, images: IMG.rainbow, reel: "3 Reel • 6000m", desc: "Nawab series — VPB's most refined 9 cord. Hand-rubbed, triple-coated, silk-smooth release with elite cutting edge." },
      { name: "Tez Talwar 12 Cord", cat: "12-cord", brand: "VPB", cord: 12, price: 2999, compare: 3499, best: false, feat: false, rating: "4.5", rc: 64, sku: "VPB-TEZ-12C", stock: 31, images: [IMG.dark[1], IMG.darkCyl[0]], reel: "3 Reel • 6000m", desc: "Tez Talwar heavy manjha for kite battles. High-tension cotton core holds shape even in gusty Uttarayan winds." },
      { name: "Chand Sitara Designer Patang (10 pc)", cat: "kites", brand: "VPB Kites", cord: 0, price: 499, compare: 699, best: true, feat: false, rating: "4.6", rc: 402, sku: "VPB-KT-CND10", stock: 150, images: IMG.kite1, reel: "10 Patangs", desc: "Hand-made designer patangs with bamboo frame and premium paper. Balanced for stable flight, ready to tie and fly." },
      { name: "Adnan Patang Premium (20 pc)", cat: "kites", brand: "VPB • Adnan", cord: 0, price: 899, compare: 1199, best: true, feat: true, rating: "4.7", rc: 256, sku: "VPB-KT-ADN20", stock: 120, images: IMG.kite2, reel: "20 Patangs", desc: "Genuine Adnan-style patangs — thin, fast, deadly in pench. Competition cut, kite-maker finished." },
      { name: "Saddi + Charkhi Combo", cat: "accessories", brand: "VPB", cord: 0, price: 349, compare: 499, best: false, feat: false, rating: "4.5", rc: 118, sku: "VPB-ACC-CHK", stock: 200, images: [IMG.tools[1], IMG.tools[0]], reel: "1 Charkhi + Saddi", desc: "Strong wooden charkhi with 1000m saddi. Smooth spin, comfortable grip — everything except the manjha." },
      { name: "VPB Heritage 16 Cord (Limited)", cat: "premium-manjha", brand: "VPB Heritage", cord: 16, price: 4999, compare: 5999, best: false, feat: true, rating: "5.0", rc: 41, sku: "VPB-HER-16C", stock: 12, images: [IMG.darkCyl[1], IMG.dark[0]], reel: "3 Reel • 6000m", desc: "Limited Heritage 16 cord — the heaviest VPB makes. For giant kites and exhibition flying. Numbered reels." },
      { name: "Gulab Special 6 Cord", cat: "special-manjha", brand: "VPB • Gulab", cord: 6, price: 1599, compare: 1899, best: false, feat: false, rating: "4.6", rc: 89, sku: "VPB-GLB-6C", stock: 47, images: [IMG.rainbow[1], IMG.rainbow[0]], reel: "2 Reel • 4000m", desc: "Gulab special — smooth pink-coated 6 cord, gentle on hands, sharp in pench. A VPB house favourite." },
    ];

    for (const p of prodDefs) {
      const slug = slugify(p.name);
      const ex = await db.select().from(products).where(eq(products.slug, slug));
      const highlights = ["100% pure cotton base", `${p.cord ? p.cord + " cord Bareilly manjha" : "Hand-crafted in Bareilly"}`, "Quality tested every 500m", "Pan-India shipping in 4–6 days"];
      const specs = { Brand: p.brand, "Cord Count": String(p.cord || "—"), Reel: p.reel, SKU: p.sku, Base: "100% Pure Cotton", Origin: "Bareilly, UP" };
      if (ex.length) {
        await db.update(products).set({ price: p.price, comparePrice: p.compare, images: p.images, categoryId: catIds[p.cat], bestseller: p.best, featured: p.feat, description: p.desc, highlights, specs, brand: p.brand, cordCount: p.cord, stockQuantity: p.stock }).where(eq(products.id, ex[0].id));
        continue;
      }
      await db.insert(products).values({
        name: p.name, slug, description: p.desc, categoryId: catIds[p.cat], brand: p.brand,
        cordCount: p.cord, reelCount: p.reel, length: p.reel, price: p.price, comparePrice: p.compare,
        stockQuantity: p.stock, stockStatus: "in_stock", sku: p.sku, featured: p.feat, bestseller: p.best,
        active: true, images: p.images, rating: p.rating, reviewCount: p.rc, highlights, specs,
      });
    }

    const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@vpbmanjha.in";
    const adminPass  = process.env.SEED_ADMIN_PASSWORD || "VPBAdmin@2026!";
    const exA = await db.select().from(users).where(eq(users.email, adminEmail));
    if (!exA.length) {
      await db.insert(users).values({ name: "VPB Admin", email: adminEmail, phone: "9727328905", passwordHash: await hashPassword(adminPass), role: "admin", active: true });
    }
    const demoEmail = process.env.SEED_DEMO_EMAIL || "demo@vpb.in";
    const demoPass  = process.env.SEED_DEMO_PASSWORD || "Demo@VPB2026!";
    const exD = await db.select().from(users).where(eq(users.email, demoEmail));
    if (!exD.length) {
      await db.insert(users).values({ name: "Demo Customer", email: demoEmail, phone: "9999999999", passwordHash: await hashPassword(demoPass), role: "customer", active: true });
    }

    const bEx = await db.select().from(banners);
    if (!bEx.length) {
      await db.insert(banners).values([
        { title: "Uttarayan Collection Live", subtitle: "Adnan • Black Panther • Nawab — tournament reels restocked", image: "/images/manjha/m09.png", link: "/shop", active: true, sortOrder: 0 },
        { title: "Flat ₹200 OFF above ₹6000", subtitle: "Auto-applied at checkout. Pan-India shipping.", image: "/images/manjha/m04.png", link: "/shop", active: true, sortOrder: 1 },
      ]);
    }
    const cEx = await db.select().from(siteContent);
    if (!cEx.length) {
      await db.insert(siteContent).values([
        { key: "announcement", value: "Get Flat ₹200 OFF on orders above ₹6000 — 100% Pure Cotton Bareilly Manjha" },
        { key: "brand_story", value: "Verai Patang Bhandar (VPB) — Bareilly's trusted manjha house. Three generations of karigars, one promise: honest, sharp, pure-cotton manjha." },
      ]);
    }
    return NextResponse.json({ ok: true, message: "Seeded" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
export async function GET() { return POST(); }
