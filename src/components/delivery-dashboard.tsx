"use client";
import { SectionLoader, TableSkeleton } from "@/components/loading";
import { useRouter } from "next/navigation";
import { useEffect, useState } from 'react';
import { ArrowDownUp, Search, Truck, RefreshCw, LogOut } from 'lucide-react';
import { SHIPMENT_STATUSES, statusLabel } from '@/lib/shipment-rules';
import { useAuth } from '@/lib/store';
import DeliveryEditor from './delivery-editor';
import { deliveryRequest, type Settings, type ShipmentRow } from './delivery-types';

type Result = { rows: ShipmentRow[]; total: number; summary: { status: string; count: number }[] };
const initialFilters = { q: '', status: '', provider: '', payment: '', from: '', to: '', sort: 'date', direction: 'desc' };
function Badge({ status }: { status: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' : ['DELIVERY_FAILED', 'RETURN_TO_ORIGIN', 'CANCELLED'].includes(status) ? 'bg-red-50 text-red-800' : 'bg-[#f6ead2] text-[#7a5b1e]'}`}>{statusLabel(status)}</span>;
}
export default function DeliveryDashboard() {
  const { logout } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<ShipmentRow | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ ...filters, page: String(page) });
    Promise.all([deliveryRequest<Settings>('/api/delivery/settings', { signal: controller.signal }), deliveryRequest<Result>('/api/delivery/shipments?' + params, { signal: controller.signal })]).then(([s, r]) => { if (controller.signal.aborted) return; setSettings(s); setResult(r); setError(''); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [filters, page, revision]);
  useEffect(() => {
    const sync = () => { if (!editing && document.visibilityState === 'visible') { setBusy(true); setRevision(n => n + 1); } };
    const timer = window.setInterval(sync, 15000);
    window.addEventListener('focus', sync);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', sync); };
  }, [editing]);
  function reload() { setBusy(true); setRevision(n => n + 1); }
  const admin = settings?.me.role === 'admin';
  const count = (...statuses: string[]) => result?.summary.filter(s => statuses.includes(s.status)).reduce((n, s) => n + s.count, 0) || 0;
  const change = (key: keyof typeof draft, value: string) => setDraft(prev => ({ ...prev, [key]: value }));
  return <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.22em] text-[#7a1f1f]"><Truck size={17} />VPB Operations</p><h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">Courier Shipments</h1><p className="mt-2 text-sm text-stone-500">{settings?.me.allOrders ? 'All orders' : 'Your assigned orders'} · Manual courier updates</p></div><div className="flex flex-wrap gap-2"><button onClick={reload} disabled={busy} className="btn-ghost" aria-label="Refresh shipments"><RefreshCw size={16} /></button><button className="btn-ghost" onClick={async () => { await logout(); router.replace('/delivery/login'); }}><LogOut size={16} />Sign out</button></div></header>
    <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Shipment summary">{[
      ['To assign', count('NOT_ASSIGNED')], ['Pending pickup', count('ASSIGNED', 'PICKUP_PENDING')], ['On the way', count('PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY')], ['Delivery failed', count('DELIVERY_FAILED')], ['Returns', count('RETURN_TO_ORIGIN')],
    ].map(([title, value]) => <div className="card p-4 sm:p-5" key={title}><p className="text-xs font-semibold text-stone-500">{title}</p><p className="mt-2 font-serif text-3xl font-bold text-[#7a1f1f]">{result ? value : '—'}</p></div>)}</section>

    {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {error && <div role="alert" className="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}<button onClick={reload} className="font-bold underline">Retry</button></div>}
    <>
      <form className="card mt-6 space-y-4 p-4 sm:p-5" onSubmit={e => { e.preventDefault(); setBusy(true); setPage(1); setFilters({ ...draft }); }}>
        <div className="flex flex-wrap gap-3"><label className="relative min-w-0 flex-1 basis-64"><span className="sr-only">Search shipments</span><Search size={17} className="absolute left-3 top-3.5 text-stone-400" /><input className="input !pl-10" value={draft.q} maxLength={120} onChange={e => change('q', e.target.value)} placeholder="Order, customer, phone or AWB number" /></label><button className="btn-primary">Search & filter</button><button type="button" className="btn-ghost" onClick={() => { setDraft(initialFilters); setFilters({ ...initialFilters }); setPage(1); setBusy(true); }}>Reset</button></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <label className="text-xs font-semibold">Shipment status<select className="input mt-1" value={draft.status} onChange={e => change('status', e.target.value)}><option value="">All statuses</option>{SHIPMENT_STATUSES.map(s => <option value={s} key={s}>{statusLabel(s)}</option>)}</select></label>
          <label className="text-xs font-semibold">Courier company<select className="input mt-1" value={draft.provider} onChange={e => change('provider', e.target.value)}><option value="">All couriers</option>{settings?.providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="text-xs font-semibold">Payment status<select className="input mt-1" value={draft.payment} onChange={e => change('payment', e.target.value)}><option value="">All payments</option>{['pending', 'paid', 'failed', 'refunded'].map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="text-xs font-semibold">From date (India)<input className="input mt-1" type="date" value={draft.from} onChange={e => change('from', e.target.value)} /></label>
          <label className="text-xs font-semibold">To date (India)<input className="input mt-1" type="date" value={draft.to} onChange={e => change('to', e.target.value)} /></label>
          <label className="text-xs font-semibold">Sort by<select className="input mt-1" value={draft.sort} onChange={e => change('sort', e.target.value)}>{[['date', 'Order date'], ['order', 'Order ID'], ['customer', 'Customer'], ['updated', 'Last updated']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold">Sort direction<select className="input mt-1" value={draft.direction} onChange={e => change('direction', e.target.value)}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
        </div>
      </form>
      <SectionLoader active={busy && !!result} label="Refreshing shipments…" compact />
      <section className="card mt-5 overflow-hidden" aria-label="Shipment results" aria-busy={busy}>
        <div className="flex items-center justify-between border-b border-[#e7d6b8] px-5 py-4"><h2 className="font-serif text-lg font-bold">{result?.total ?? '—'} shipments</h2><ArrowDownUp size={16} className="text-stone-400" /></div>
        {busy && !result ? <><SectionLoader label="Loading shipments…" /><TableSkeleton /></> : error && !result ? <p className="p-8 text-center text-sm text-stone-500">Unable to load shipments. Use Retry above.</p> : !result?.rows.length ? <div className="p-12 text-center"><Truck size={32} className="mx-auto text-[#c9a24b]" /><h3 className="mt-3 font-serif text-xl font-bold">No shipments found</h3><p className="mt-2 text-sm text-stone-500">Try different filters, or ask your administrator to assign orders.</p></div> : <>
          <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[1220px] text-left text-sm"><thead className="bg-[#f9f2e6] text-[11px] uppercase tracking-wider text-stone-500"><tr>{['Order / date', 'Customer / address', 'Products', 'Payment / order', 'Courier / tracking', 'Shipment', 'Actions'].map(h => <th className="px-4 py-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y divide-[#eee3d0]">{result.rows.map(row => <tr key={row.id} className="align-top hover:bg-[#fffaf0]"><td className="px-4 py-5"><p className="whitespace-nowrap font-bold">{row.orderNumber}</p><p className="mt-1 text-xs text-stone-500">{new Date(row.createdAt).toLocaleDateString('en-IN')}</p></td><td className="max-w-60 px-4 py-5"><p className="font-semibold">{row.customerName || row.shippingAddress.name}</p><p className="text-xs">{row.customerPhone || row.shippingAddress.phone}</p><p className="mt-2 text-xs leading-relaxed text-stone-500">{['addressLine', 'landmark', 'city', 'state', 'pincode'].map(k => row.shippingAddress[k]).filter(Boolean).join(', ')}</p></td><td className="max-w-52 px-4 py-5"><ul className="space-y-1 text-xs">{row.items.map(i => <li key={i.id}>{i.productName} <b>× {i.quantity}</b></li>)}</ul></td><td className="px-4 py-5"><p className="font-semibold capitalize">{row.paymentStatus}</p><p className="text-xs capitalize text-stone-500">{row.paymentMethod}</p><p className="mt-3 text-xs capitalize">Order: {row.orderStatus}</p></td><td className="max-w-48 px-4 py-5"><p className="font-semibold">{row.courier || 'Not assigned'}</p><p className="mt-1 break-all font-mono text-xs">{row.docketNumber || 'No docket yet'}</p>{row.trackingUrl && <a href={row.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-bold text-[#7a1f1f] underline">Track courier ↗</a>}</td><td className="px-4 py-5"><Badge status={row.status} /><p className="mt-2 text-[11px] text-stone-500">Updated {new Date(row.updatedAt).toLocaleString('en-IN')}</p>{admin && <p className="mt-1 text-xs">{settings?.staff.find(s => s.id === row.assignedTo)?.name || 'Unassigned staff'}</p>}</td><td className="px-4 py-5"><button className="btn-ghost !px-3 !py-2 !text-xs" disabled={busy} onClick={() => setEditing(row)}>Edit courier</button></td></tr>)}</tbody></table></div>
          <div className="divide-y divide-[#e7d6b8] lg:hidden">{result.rows.map(row => <article key={row.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{row.orderNumber}</h3><Badge status={row.status} /></div><p className="mt-1 text-xs text-stone-500">{new Date(row.createdAt).toLocaleString('en-IN')}</p><p className="mt-3 text-sm font-semibold">{row.customerName} · {row.customerPhone}</p><p className="mt-1 text-xs text-stone-500">{['addressLine', 'city', 'state', 'pincode'].map(k => row.shippingAddress[k]).filter(Boolean).join(', ')}</p><ul className="mt-3 text-sm">{row.items.map(i => <li key={i.id}>{i.productName} × {i.quantity}</li>)}</ul><p className="mt-3 text-xs capitalize">Payment: {row.paymentStatus} · {row.paymentMethod} · Order: {row.orderStatus}</p><p className="mt-2 break-all text-sm">{row.courier || 'Courier not assigned'} · {row.docketNumber || 'No AWB yet'}</p>{row.trackingUrl && <a href={row.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block text-sm text-[#7a1f1f] underline">Track courier ↗</a>}<p className="mt-2 text-xs text-stone-500">Updated {new Date(row.updatedAt).toLocaleString('en-IN')}{admin ? ' · ' + (settings?.staff.find(s => s.id === row.assignedTo)?.name || 'Unassigned staff') : ''}</p><button className="btn-ghost mt-4 w-full" disabled={busy} onClick={() => setEditing(row)}>Edit courier</button></article>)}</div>
        </>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e7d6b8] p-4 text-sm"><p>Page {page} of {Math.max(1, Math.ceil((result?.total || 0) / 20))}</p><div className="flex gap-2"><button className="btn-ghost disabled:opacity-40" disabled={busy || page <= 1} onClick={() => { setBusy(true); setPage(p => p - 1); }}>Previous</button><button className="btn-ghost disabled:opacity-40" disabled={busy || page * 20 >= (result?.total || 0)} onClick={() => { setBusy(true); setPage(p => p + 1); }}>Next</button></div></div>
      </section>
    </>
    {editing && settings && <DeliveryEditor row={editing} settings={settings} close={() => setEditing(null)} saved={() => { setEditing(null); setMessage('Courier details saved. Customer tracking is up to date.'); reload(); }} />}
  </main>;
}
