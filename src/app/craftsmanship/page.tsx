import Link from "next/link";
import { ArrowRight, AtSign } from "lucide-react";
import { HERO_VIDEO_2, HERO_POSTER, INSTAGRAM_URL } from "@/lib/data";
import { SafeImg } from "@/components/site";

const STEPS = [
  ["https://images.pexels.com/photos/15049300/pexels-photo-15049300.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", "01 — Selecting the Cotton", "Long-staple pure cotton only. No nylon, no mixing. The thread must hold glass without snapping in pench."],
  ["https://images.pexels.com/photos/12672112/pexels-photo-12672112.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", "02 — Starch & Glass Paste", "Rice-starch boiled to exact thickness, mixed with hand-pounded glass powder. This is the family recipe."],
  ["https://images.pexels.com/photos/4440344/pexels-photo-4440344.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", "03 — Hand Rubbing", "Karigars pull kilometres of thread through paste-soaked pads — twice for 6 cord, thrice for 9 cord — at a runner's pace."],
  ["https://images.pexels.com/photos/15470478/pexels-photo-15470478.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", "04 — Sun Drying & Testing", "Reels sun-dried, then tension-tested every 500m. Only reels that sing pass the VPB seal."],
];

export default function Craft() {
  return (
    <div>
      <section className="relative flex min-h-[70vh] items-end overflow-hidden bg-[#170c07]">
        <video autoPlay muted loop playsInline poster={HERO_POSTER} className="absolute inset-0 h-full w-full object-cover opacity-80"><source src={HERO_VIDEO_2} type="video/mp4" /></video>
        <div className="absolute inset-0 bg-gradient-to-t from-[#170c07] via-[#170c07]/40 to-transparent" />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-14 pt-28 sm:px-6">
          <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[#c9a24b]">VPB Craftsmanship</p>
          <h1 className="mt-2 max-w-3xl font-serif text-[clamp(2rem,5.5vw,3.8rem)] font-black leading-tight text-[#fdf6e7]">Manjha-making is a ritual.<br />We never rush rituals.</h1>
          <p className="mt-3 max-w-xl text-[#e9d5ae]">From @verai_patang_bhandar — real karigars, real paste, real Bareilly mornings.</p>
        </div>
      </section>
      <div className="mx-auto max-w-7xl space-y-16 px-4 py-14 sm:px-6">
        {STEPS.map(([img, t, s], i) => (
          <div key={t} className={`reveal grid items-center gap-8 lg:grid-cols-2 ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[24px] shadow-xl"><SafeImg src={img} alt={t} sizes="50vw" className="object-cover transition duration-700 hover:scale-105" /></div>
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
