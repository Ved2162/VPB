"use client";
import { ButtonLoader } from "@/components/loading";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/store';
import { deliveryRequest } from '@/components/delivery-types';

export default function AdminLogin() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const router = useRouter();
  return <div className="mx-auto max-w-md px-4 py-14"><div className="rounded-[22px] bg-[#1c0f0a] p-8 text-[#f0d9a8]">
    <p className="text-xs font-bold uppercase tracking-[.3em] text-[#c9a24b]">VPB Main Admin</p><h1 className="mt-1 font-serif text-3xl font-bold text-white">Control Room</h1>
    <form className="mt-5 space-y-4" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget);
      try {
        const result = await deliveryRequest<{ user: { id: string; name: string; phone: string; role: string } }>('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
        setUser(result.user); router.replace('/admin');
      } catch (error) { setError(error instanceof Error ? error.message : 'Unable to sign in'); setBusy(false); }
    }}>
      <label className="block text-sm font-semibold">Admin ID<input name="username" required autoComplete="username" maxLength={80} className="input mt-2 !border-white/20 !bg-white/10 !text-white" /></label>
      <label className="block text-sm font-semibold">Password<input name="password" required type="password" autoComplete="current-password" maxLength={72} className="input mt-2 !border-white/20 !bg-white/10 !text-white" /></label>
      {error && <p role="alert" className="rounded-xl bg-red-900/60 p-3 text-sm text-red-200">{error}</p>}
      <button disabled={busy} className="btn-gold w-full disabled:opacity-50">{busy ? <ButtonLoader label='Signing in…' /> : 'Login to Dashboard'}</button>
    </form>
  </div></div>;
}
