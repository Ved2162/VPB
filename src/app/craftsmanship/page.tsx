import { ViewportVideo } from '@/components/viewport-video';
import { BrandedLink as Link } from "@/components/loading";
import { ArrowRight, AtSign } from "lucide-react";
import { INSTAGRAM_URL, WORKSHOP_IMAGES } from "@/lib/data";
import { SafeImg } from "@/components/site";

const STEPS = [
  [WORKSHOP_IMAGES[3], "01 — Selecting the Cotton", "Long-staple pure cotton only. No nylon, no mixing. The thread must hold the authentic Bareilly manjha paste without snapping in pench."],
  [WORKSHOP_IMAGES[4], "02 — Starch & Manjha Paste", "Rice-starch boiled to exact thickness, blended with authentic Bareilly manjha paste. This is the family recipe, passed down for generations."],
  [WORKSHOP_IMAGES[2], "03 — Hand Rubbing", "Karigars pull kilometres of thread through paste-soaked pads — twice for 6 cord, thrice for 9 cord — at a runner's pace."],
  [WORKSHOP_IMAGES[5], "04 — Sun Drying & Testing", "Reels sun-dried, then tension-tested every 500m. Only reels that sing pass the VPB seal."],
];

export default function Craft() {
  return (
    <div>
      <section className="bg-gradient-to-br from-[#170c07] via-[#24130c] to-[#170c07]">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:min-h-[70vh] lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:py-14">
          <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#c9a24b]">VPB Craftsmanship</p>
          <h1 className="mt-2 max-w-3xl font-serif text-[clamp(2rem,5.5vw,3.8rem)] font-black leading-tight text-[#fdf6e7]">Manjha-making is a ritual.<br />We never rush rituals.</h1>
          <p className="mt-3 max-w-xl text-[#e9d5ae]">From @verai_patang_bhandar — real karigars, real paste, real Bareilly mornings.</p>
          </div>
          <div className="mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-[24px] border border-[#c9a24b]/25 bg-black shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
            <ViewportVideo src="/videos/craftsmanship.mp4" width={1080} height={1920} label="VPB craftsmen making Bareilly manjha" poster={WORKSHOP_IMAGES[3]} className="h-full w-full object-contain" />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl space-y-16 px-4 py-14 sm:px-6">
        {STEPS.map(([img, t, s], i) => (
          <div key={t} className={`reveal grid items-center gap-8 lg:grid-cols-2 ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[24px] shadow-xl"><SafeImg src={img} alt={t} sizes="50vw" className={`object-cover transition duration-700 hover:scale-105 ${i === 0 ? "object-[50%_80%]" : "object-[50%_62%]"}`} /></div>
            <div><p className="font-serif text-5xl font-black text-[#ecdcb9]">{t.split(" — ")[0]}</p><h2 className="mt-1 font-serif text-3xl font-bold">{t.split(" — ")[1]}</h2><p className="mt-3 leading-relaxed text-stone-600">{s}</p></div>
          </div>
        ))}
        <section className="rounded-[26px] bg-[#1c0f0a] p-8 text-center sm:p-12">
          <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#c9a24b]">See it live</p>
          <h3 className="mt-2 font-serif text-3xl font-bold text-[#f7ead7]">Manjha-making videos, every week.</h3>
          <a href={INSTAGRAM_URL} target="_blank" className="btn-gold mt-5"><AtSign size={16} /> Follow @verai_patang_bhandar</a>
        </section>
        <div className="text-center"><Link href="/shop" className="btn-primary">Shop Hand-Crafted Manjha <ArrowRight size={16} /></Link></div>
      </div>
    </div>
  );
}
