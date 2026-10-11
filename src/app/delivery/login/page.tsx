"use client";
import { ButtonLoader } from "@/components/loading";
import { apiFetch } from "@/lib/api-client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck } from 'lucide-react';
import { useAuth } from '@/lib/store';

export default function DeliveryLogin() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { setUser } = useAuth();
  return <main className="mx-auto max-w-md px-4 py-14">
    <div className="rounded-3xl bg-[#1c0f0a] p-8 text-[#f0d9a8] shadow-xl">
      <Truck className="mb-5 text-[#c9a24b]" size={32} />
      <p className="text-xs font-bold uppercase tracking-[.25em] text-[#c9a24b]">VPB delivery team</p>
      <h1 className="mt-2 font-serif text-3xl font-bold text-white">Every order, cared for.</h1>
      <p className="mt-3 text-sm">Sign in to manage your assigned shipments.</p>
      <form className="mt-6 space-y-4" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError('');
        const form = new FormData(e.currentTarget);
        try {
          const response = await apiFetch('/api/delivery/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: form.get('phone'), password: form.get('password') }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Unable to sign in');
          setUser(result.user); router.replace('/delivery');
        } catch (error) { setError(error instanceof Error ? error.message : 'Unable to sign in'); }
        finally { setBusy(false); }
      }}>
        <label className="block text-sm font-semibold">Mobile number<input name="phone" type="tel" autoComplete="username" required maxLength={20} className="input mt-2 !bg-white !text-stone-900" /></label>
        <label className="block text-sm font-semibold">Password<input name="password" type="password" autoComplete="current-password" required maxLength={72} className="input mt-2 !bg-white !text-stone-900" /></label>
        {error && <p role="alert" className="rounded-xl bg-red-950 p-3 text-sm text-red-100">{error}</p>}
        <button className="btn-gold w-full disabled:opacity-50" disabled={busy}>{busy ? <ButtonLoader label='Signing in…' /> : 'Sign in to deliveries'}</button>
      </form>
      <p className="mt-5 text-xs">Access is managed by your main administrator.</p>
    </div>
  </main>;
}
