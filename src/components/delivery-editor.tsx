"use client";
import { SectionLoader, ButtonLoader } from "@/components/loading";
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { statusLabel, TRANSITIONS, type ShipmentStatus } from '@/lib/shipment-rules';
import { deliveryRequest, type Settings, type ShipmentRow } from './delivery-types';
import type { ShipmentSnapshot } from '@/db/schema';

type History = { id: string; actorName: string; createdAt: string; before: ShipmentSnapshot; after: ShipmentSnapshot };
export default function DeliveryEditor({ row, settings, close, saved }: { row: ShipmentRow; settings: Settings; close: () => void; saved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ providerId: row.providerId || '', trackingUrl: row.trackingUrl, docketNumber: row.docketNumber, status: row.status, internalNotes: row.internalNotes, assignedTo: row.assignedTo || '' });
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<History[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { const el = dialog.current!; el.showModal(); return () => el.close(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    deliveryRequest<{ history: History[] }>('/api/delivery/shipments/' + row.id, { signal: controller.signal }).then(data => { if (controller.signal.aborted) return; setHistory(data.history); setHistoryError(''); }).catch(e => { if (!controller.signal.aborted) setHistoryError(e.message); });
    return () => controller.abort();
  }, [row.id, attempt]);
  const field = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  return <dialog ref={dialog} aria-labelledby="courier-editor-title" onCancel={e => { if (busy) e.preventDefault(); else close(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl bg-[#fffdf8] p-0 text-[#291a13] shadow-2xl backdrop:bg-black/50">
    <div className="flex items-start justify-between gap-4 border-b border-[#e7d6b8] p-5 sm:p-7"><div><p className="text-xs font-bold tracking-widest text-[#7a1f1f]">{row.orderNumber}</p><h2 id="courier-editor-title" className="font-serif text-2xl font-bold">Edit Courier Info</h2></div><button disabled={busy} onClick={close} aria-label="Close courier editor" className="rounded-lg p-2 hover:bg-stone-100"><X size={20} /></button></div>
    <form className="space-y-4 p-5 sm:p-7" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      try {
        const { assignedTo, ...fields } = form;
        await deliveryRequest('/api/delivery/shipments/' + row.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, providerId: fields.providerId || null, version: row.version, ...(settings.me.role === 'admin' ? { assignedTo: assignedTo || null } : {}) }) });
        saved();
      } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save'); }
      finally { setBusy(false); }
    }}>
      {settings.me.role === 'admin' && <label className="block text-sm font-semibold">Assigned delivery staff<select className="input mt-1" value={form.assignedTo} onChange={e => field('assignedTo', e.target.value)}><option value="">Unassigned</option>{settings.staff.filter(s => s.active || s.id === form.assignedTo).map(s => <option key={s.id} value={s.id} disabled={!s.active}>{s.name}{!s.active ? ' (disabled)' : ''}</option>)}</select></label>}
      <fieldset><legend className="text-sm font-semibold">Courier company</legend><input aria-label="Search courier companies" placeholder="Search courier companies" value={query} onChange={e => setQuery(e.target.value)} className="input mt-1" /><select aria-label="Courier company" className="input mt-2" value={form.providerId} onChange={e => {
        const provider = settings.providers.find(p => p.id === e.target.value);
        setForm(prev => ({ ...prev, providerId: e.target.value, trackingUrl: provider?.trackingUrl || '' }));
      }}><option value="">Select courier</option>{settings.providers.filter(p => (p.active && p.name.toLowerCase().includes(query.toLowerCase())) || p.id === form.providerId).map(p => <option key={p.id} value={p.id} disabled={!p.active && p.id !== row.providerId}>{p.name}{!p.active ? ' (inactive)' : ''}</option>)}</select></fieldset>
      {!settings.providers.some(p => p.active) && <p className="text-sm text-amber-800">The main admin must configure a courier provider before assigning courier information.</p>}
      <label className="block text-sm font-semibold">Courier tracking URL<input type="url" maxLength={2048} value={form.trackingUrl} onChange={e => field('trackingUrl', e.target.value)} placeholder="https://courier-website.com/track" className="input mt-1" /><span className="mt-1 block text-xs font-normal text-stone-500">Use the configured courier website. Tracking is updated manually.</span></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Docket / AWB number<input value={form.docketNumber} maxLength={80} onChange={e => field('docketNumber', e.target.value)} className="input mt-1" /></label><label className="block text-sm font-semibold">Shipment status<select value={form.status} onChange={e => field('status', e.target.value)} className="input mt-1">{[row.status, ...(TRANSITIONS[row.status as ShipmentStatus] || [])].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label></div>
      <label className="block text-sm font-semibold">Internal delivery notes<textarea value={form.internalNotes} onChange={e => field('internalNotes', e.target.value)} maxLength={2000} rows={3} className="input mt-1" /><span className="text-xs font-normal text-stone-500">Visible only to authorized staff.</span></label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={close} className="btn-ghost">Cancel</button><button disabled={busy} className="btn-primary disabled:opacity-50">{busy ? <ButtonLoader label='Saving…' /> : 'Save Changes'}</button></div>
    </form>
    <section className="border-t border-[#e7d6b8] p-5 sm:p-7"><h3 className="font-serif text-lg font-bold">Shipment history</h3>
      {historyError ? <div role="alert" className="mt-2 text-sm text-red-700">{historyError}<button className="ml-2 underline" onClick={() => setAttempt(n => n + 1)}>Retry history</button></div> : history === null ? <SectionLoader label="Loading history…" compact /> : !history.length ? <p className="mt-2 text-sm text-stone-500">No shipment changes yet.</p> : <ol className="mt-4 space-y-4 border-l-2 border-[#c9a24b] pl-4">{history.map(h => <li key={h.id} className="text-sm">
        <p className="font-bold">{statusLabel(h.before.status)} → {statusLabel(h.after.status)}</p><p className="text-xs text-stone-500">{h.actorName} · {new Date(h.createdAt).toLocaleString('en-IN')}</p>
        {(['courierName', 'docketNumber', 'trackingUrl', 'assignedTo', 'internalNotes'] as const).filter(k => h.before[k] !== h.after[k]).map(k => <p key={k} className="mt-1 break-words text-xs"><b>{{ courierName: 'Courier', docketNumber: 'Docket', trackingUrl: 'Tracking link', assignedTo: 'Assignment', internalNotes: 'Internal note' }[k]}:</b> {k === 'assignedTo' ? `${settings.staff.find(s => s.id === h.before[k])?.name || h.before[k] || 'Unassigned'} → ${settings.staff.find(s => s.id === h.after[k])?.name || h.after[k] || 'Unassigned'}` : `${h.before[k] || 'None'} → ${h.after[k] || 'None'}`}</p>)}
      </li>)}</ol>}
    </section>
  </dialog>;
}
