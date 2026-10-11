"use client";
import { ButtonLoader } from "@/components/loading";
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/store';
import { deliveryRequest } from './delivery-types';

export default function DeliveryReauth({ done, cancel }: { done: () => void; cancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} aria-labelledby="admin-reauth-title" onCancel={event => { if (busy) event.preventDefault(); else cancel(); }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl bg-[#fffdf8] p-6 text-[#291a13] shadow-2xl backdrop:bg-black/50">
    <h2 id="admin-reauth-title" className="font-serif text-2xl font-bold">Sign in to save your changes</h2><p className="mt-2 text-sm text-stone-500">Your admin session ended. Your form is preserved; sign in to finish saving.</p>
    <form className="mt-5 space-y-4" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget);
      try {
        const result = await deliveryRequest<{ user: { id: string; name: string; phone: string; role: string } }>('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
        if (result.user.role !== 'admin') throw new Error('Use your main admin account to manage staff and couriers.');
        setUser(result.user); done();
      } catch (error) { setError(error instanceof Error ? error.message : 'Unable to sign in'); }
      finally { setBusy(false); }
    }}>
      <label className="block text-sm font-semibold">Admin ID<input required name="username" autoComplete="username" className="input mt-1" /></label><label className="block text-sm font-semibold">Admin password<input required type="password" name="password" autoComplete="current-password" className="input mt-1" /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3"><button type="button" className="btn-ghost" disabled={busy} onClick={cancel}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? <ButtonLoader label='Signing in…' /> : 'Sign in and retry'}</button></div>
    </form>
  </dialog>;
}
