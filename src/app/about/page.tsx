import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHead, CtaBand, SafeImg } from "@/components/site";
import { CRAFT_IMAGES } from "@/lib/data";

export default function About() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#7a1f1f]">About VPB</p>
      <h1 className="mt-1 max-w-3xl font-serif text-[clamp(2rem,5vw,3.4rem)] font-black leading-tight">Verai Patang Bhandar —<br />Bareilly's House of Sharp Threads.</h1>
      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div className="relative aspect-[4/4.4] w-full overflow-hidden rounded-[24px]"><SafeImg src={CRAFT_IMAGES[0]} alt="VPB heritage" sizes="50vw" className="object-cover" /></div>
        <div className="prose-vpb text-[15.5px]">
          <p><b className="text-[#2b140d]">VPB began on a Bareilly rooftop</b> — with a charkhi, a pot of rice-starch manjha paste, and a grandfather who believed a thread should sing before it cuts.</p>
          <p>Three generations later, Verai Patang Bhandar still prepares manjha the slow way: pure cotton yarn, authentic Bareilly manjha paste, sun-drying, and metre-by-metre testing. Our karigars sign every batch — because reputation flies with every reel.</p>
          <p>Today VPB ships Adnan Special, Black Panther, Nawab, Ustad and Heritage reels to flyers in 20+ states — from Jaipur terraces to Ahmedabad's Uttarayan sky. Same paste. Same hands. Same promise.</p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[["100%", "Pure Cotton"], ["500m", "Test Interval"], ["24h", "Dispatch"]].map(([n, l]) => (
              <div key={l} className="rounded-2xl border border-[#ecdcb9] bg-white p-4 text-center"><p className="font-serif text-xl font-black text-[#7a1f1f]">{n}</p><p className="text-xs font-semibold text-stone-500">{l}</p></div>
            ))}
          </div>
          <div className="mt-6 flex gap-3"><Link href="/shop" className="btn-primary">Shop the Craft <ArrowRight size={16} /></Link><Link href="/craftsmanship" className="btn-ghost">Craftsmanship</Link></div>
        </div>
      </div>
      <div className="mt-16">
        <SectionHead kicker="Philosophy" title="What VPB Stands For" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[["Authenticity First", "Every reel carries batch number, seal and karigar stamp. If it doesn't say VPB, it isn't VPB."], ["Craft Over Volume", "We prepare limited batches daily instead of mass-coating. Slow manjha cuts faster."], ["Flyer's Trust", "Pench guarantee, honest cord counts, real prices. Terraces remember who cheated — we never do."]].map(([t, s]) => (
            <div key={t} className="card p-7"><p className="font-serif text-xl font-bold">{t}</p><p className="mt-2 text-sm leading-relaxed text-stone-600">{s}</p></div>
          ))}
        </div>
      </div>
      <div className="mt-14 grid gap-4 lg:grid-cols-2">
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[22px]"><SafeImg src={CRAFT_IMAGES[1]} alt="Karigar" sizes="50vw" className="object-cover" /></div>
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[22px]"><SafeImg src={CRAFT_IMAGES[2]} alt="Spools" sizes="50vw" className="object-cover" /></div>
      </div>
      <div className="mt-14"><CtaBand /></div>
    </div>
  );
}
