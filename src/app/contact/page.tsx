"use client";
import { useState } from "react";
import { Phone, Mail, MapPin, Clock, AtSign } from "lucide-react";
import { useToast } from "@/lib/store";
import { INSTAGRAM_URL, PHONE_DISPLAY, WHATSAPP_URL, ADDRESS, ADDRESS_MAPS_URL } from "@/lib/data";

export default function Contact() {
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", phone: "", msg: "" });
  const faqs = [
    ["How long is delivery?", "4–6 working days across India. Dispatched within 24 hours, vacuum-packed."],
    ["Is the manjha pure cotton?", "Yes — 100% pure cotton, no nylon mix. Every reel is batch-tested."],
    ["Which cord should I buy?", "6 cord for daily flying, 9 cord for tournaments, 12/16 for big kites and strong winds."],
    ["Do you offer COD?", "No, we currently accept UPI and Card payments only via Razorpay's secure checkout."],
    ["How long does delivery take?", "We dispatch within 24 hours. Delivery takes 4–6 working days across India. Live tracking is provided once shipped."],
  ];
  const [open, setOpen] = useState(0);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#7a1f1f]">Contact VPB</p>
      <h1 className="mt-1 font-serif text-[clamp(1.9rem,4.5vw,3rem)] font-bold">Talk to the Bhandar.</h1>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="card p-6">
            <h3 className="font-serif text-xl font-bold">Send a Message</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div><p className="label">Name</p><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="input" /></div>
              <div><p className="label">Phone</p><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="input" /></div>
              <div className="sm:col-span-2"><p className="label">Message</p><textarea value={f.msg} onChange={(e) => setF({ ...f, msg: e.target.value })} className="input min-h-28" placeholder="Bulk order? Cord advice? Tracking help?" /></div>
            </div>
            <button onClick={() => { if (!f.name || !f.msg) { toast("Add your name and message"); return; } window.open(`${WHATSAPP_URL}?text=${encodeURIComponent(`Hi VPB! I'm ${f.name}. ${f.msg}`)}`, "_blank"); setF({ name: "", phone: "", msg: "" }); }} className="btn-primary mt-4">Send via WhatsApp</button>
          </div>
          <div className="mt-6">
            <h3 className="font-serif text-xl font-bold">FAQs</h3>
            <div className="mt-3 space-y-2">
              {faqs.map(([q, a], i) => (
                <div key={q} className="card overflow-hidden">
                  <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between px-5 py-3.5 text-left text-[15px] font-bold">{q}<span className="text-[#7a1f1f]">{open === i ? "−" : "+"}</span></button>
                  {open === i && <p className="border-t border-[#f3e8d0] px-5 py-3.5 text-sm text-stone-600">{a}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-[20px] bg-[#1c0f0a] p-6 text-[#e9d5ae]">
            <p className="font-serif text-lg font-bold text-[#f7ead7]">Reach Us</p>
            <ul className="mt-3 space-y-3 text-sm">
              <li className="flex gap-2.5"><Phone size={16} className="text-[#c9a24b]" /><a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-[#e9d5ae] hover:text-white transition">{PHONE_DISPLAY} (9am–9pm)</a></li>
              <li className="flex gap-2.5"><Mail size={16} className="text-[#c9a24b]" /> care@vpbmanjha.in</li>
              <li className="flex gap-2.5 items-start"><MapPin size={16} className="mt-0.5 shrink-0 text-[#c9a24b]" /><a href={ADDRESS_MAPS_URL} target="_blank" rel="noopener noreferrer" className="text-[#e9d5ae] hover:text-white transition underline underline-offset-2">{ADDRESS}</a></li>
              <li className="flex gap-2.5"><Clock size={16} className="text-[#c9a24b]" /> Mon–Sun • 9:00–21:00 IST</li>
            </ul>
            <a href={INSTAGRAM_URL} target="_blank" className="btn-gold mt-4 w-full !text-[13px]"><AtSign size={15} /> @verai_patang_bhandar</a>
          </div>
          <div className="card p-6">
            <p className="font-serif text-lg font-bold">Bulk / Shop Orders</p>
            <p className="mt-1 text-sm text-stone-500">Kite shops, clubs and Uttarayan resellers get wholesale rates above 20 reels. WhatsApp us with your city + quantity.</p>
            <button onClick={() => toast("Wholesale enquiry noted! We'll call you back.")} className="btn-ghost mt-3 w-full">Request Wholesale Rates</button>
          </div>
        </div>
      </div>
    </div>
  );
}
