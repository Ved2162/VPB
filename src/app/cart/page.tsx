"use client";
import Link from "next/link";
import { Minus, Plus, Trash2, ArrowRight, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/store";
import { money } from "@/lib/data";
import { ProductCard, SafeImg } from "@/components/site";
import { useEffect, useState } from "react";

export default function CartPage() {
  const { lines, setQty, remove, subtotal, clear } = useCart();
  const [recs, setRecs] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/products?tag=bestseller&limit=4").then((r) => r.json()).then((j) => setRecs(j.products || [])).catch(() => {});
  }, []);
  const discount = subtotal >= 6000 ? 200 : 0;
  const ship = subtotal === 0 ? 0 : subtotal - discount >= 6000 ? 0 : 99;

  if (lines.length === 0)
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <ShoppingBag size={56} className="mx-auto text-[#c9a24b]" />
        <h1 className="mt-4 font-serif text-3xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-stone-500">Tournament-grade manjha is waiting. Go pick your reel.</p>
        <Link href="/shop" className="btn-primary mt-6">Shop Collection <ArrowRight size={16} /></Link>
        {recs.length > 0 && <div className="mt-12 text-left"><h3 className="font-serif text-xl font-bold">Bestsellers to start with</h3><div className="mt-4 grid grid-cols-2 gap-4">{recs.map((p) => (<ProductCard key={p.id} p={p} />))}</div></div>}
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-[clamp(1.8rem,4vw,2.6rem)] font-bold">Shopping Cart ({lines.reduce((a, l) => a + l.qty, 0)})</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l.id} className="card flex gap-4 p-4">
              <Link href={`/product/${l.slug}`} className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-[#f6ead2]"><SafeImg src={l.image} alt={l.name} sizes="112px" className="object-cover" /></Link>
              <div className="min-w-0 flex-1">
                <Link href={`/product/${l.slug}`} className="font-serif text-[17px] font-bold hover:text-[#7a1f1f]">{l.name}</Link>
                <p className="mt-0.5 text-sm font-bold text-[#7a1f1f]">{money(l.price)} {l.comparePrice ? <span className="font-normal text-stone-400 line-through">{money(l.comparePrice)}</span> : null}</p>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3 rounded-full border border-[#e7d6b8] px-1.5 py-1">
                    <button onClick={() => setQty(l.id, l.qty - 1)} className="grid h-7 w-7 place-items-center rounded-full hover:bg-[#f3e6cc]"><Minus size={14} /></button>
                    <span className="font-extrabold">{l.qty}</span>
                    <button onClick={() => setQty(l.id, l.qty + 1)} className="grid h-7 w-7 place-items-center rounded-full hover:bg-[#f3e6cc]"><Plus size={14} /></button>
                  </div>
                  <p className="font-serif text-lg font-black">{money(l.price * l.qty)}</p>
                  <button onClick={() => remove(l.id)} className="flex items-center gap-1 text-sm font-semibold text-stone-400 hover:text-red-700"><Trash2 size={15} /> Remove</button>
                </div>
              </div>
            </div>
          ))}
          <div className="flex justify-between"><Link href="/shop" className="text-sm font-bold text-[#7a1f1f]">← Continue shopping</Link><button onClick={clear} className="text-sm text-stone-400 hover:text-red-700">Clear cart</button></div>
        </div>
        <div className="card h-fit p-6 lg:sticky lg:top-28">
          <h3 className="font-serif text-xl font-bold">Order Summary</h3>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-stone-500">Subtotal</span><b>{money(subtotal)}</b></div>
            <div className="flex justify-between"><span className="text-stone-500">Discount {discount ? "(₹200 OFF)" : ""}</span><b className="text-green-700">-{money(discount)}</b></div>
            <div className="flex justify-between"><span className="text-stone-500">Shipping</span><b>{ship === 0 ? "FREE" : money(ship)}</b></div>
            {subtotal < 6000 && <p className="rounded-xl bg-[#fff4de] px-3 py-2 text-xs font-semibold text-[#7a5b1e]">Add {money(6000 - subtotal)} more for FREE shipping + ₹200 OFF</p>}
            <div className="flex justify-between border-t border-dashed border-[#e7d6b8] pt-3 font-serif text-xl font-black"><span>Total</span><span className="text-[#7a1f1f]">{money(subtotal - discount + ship)}</span></div>
          </div>
          <Link href="/checkout" className="btn-primary mt-5 w-full !py-3.5">Proceed to Checkout <ArrowRight size={16} /></Link>
          <p className="mt-3 text-center text-xs text-stone-400">Secure checkout • Login required at payment step</p>
        </div>
      </div>
    </div>
  );
}
