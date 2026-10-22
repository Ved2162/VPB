"use client";
import { COURIERS } from '@/lib/couriers';
import { useState } from 'react';
import { deliveryRequest, DeliveryRequestError, type Provider, type Settings, type Staff } from './delivery-types';
import DeliveryReauth from './delivery-reauth';
import { ButtonLoader } from './loading';

export default function DeliverySettings({ settings, reload }: { settings: Settings; reload: () => void }) {
  const [provider, setProvider] = useState<Partial<Provider>>({ name: '', trackingUrl: '', active: true });
  const [staff, setStaff] = useState<Partial<Staff> & { password?: string }>({ name: '', phone: '', active: true, allOrders: false, password: '' });
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ resource: string; data: object } | null>(null);
  async function deleteStaff(account: Staff) {
    if (busy) return;
    if (!window.confirm(`Delete ${account.name}'s delivery account? Access will end and assigned shipments will become unassigned. Shipment history will be kept.`)) return;
    setBusy(true); setAction(account.id); setError(''); setMessage('');
    try {
      await deliveryRequest('/api/delivery/settings', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: account.id }) });
      if (staff.id === account.id) setStaff({ name: '', phone: '', active: true, allOrders: false, password: '' });
      setMessage('Delivery staff deleted. Shipment history preserved.'); reload();
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to delete staff'); }
    finally { setBusy(false); }
  }
  async function save(resource: string, data: object) {
    if (busy) return;
    setBusy(true); setAction(resource); setError(''); setMessage('');
    try {
      await deliveryRequest('/api/delivery/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource, ...data }) });
      setMessage(resource === 'staff' ? 'Staff access saved.' : 'Courier provider saved.');
      if (resource === 'staff') setStaff({ name: '', phone: '', active: true, allOrders: false, password: '' });
      else setProvider({ name: '', trackingUrl: '', active: true });
      reload();
    } catch (error) {
      if (error instanceof DeliveryRequestError && error.status === 401) { setPending({ resource, data }); }
      else setError(error instanceof Error ? error.message : 'Unable to save');
    }
    finally { setBusy(false); }
  }
  return <section className="mt-6" aria-label="Delivery settings">
    {pending && <DeliveryReauth cancel={() => setPending(null)} done={() => { const action = pending; setPending(null); void save(action.resource, action.data); }} />}
    {message && <p role="status" className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p>}{error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="card p-5 sm:p-6"><h2 className="font-serif text-xl font-bold">Courier providers</h2><p className="mt-1 text-sm text-stone-500">Enable the official couriers used for new shipments. Existing shipment history is retained.</p>
        <ul className="my-4 space-y-2">{settings.providers.map(p => <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#f9f2e6] p-3 text-sm"><span className="min-w-0 break-words"><b>{p.name}</b><span className="block text-xs">{p.active ? 'Active' : 'Inactive'}</span></span><button type="button" disabled={!COURIERS.some(c => c.name === p.name)} className="btn-ghost !px-3 !py-2" onClick={() => setProvider(p)}>Edit {p.name}</button></li>)}</ul>
        <form className="space-y-3 border-t border-[#e7d6b8] pt-4" onSubmit={e => { e.preventDefault(); void save('provider', { id: provider.id, name: provider.name, trackingUrl: provider.trackingUrl, active: provider.active }); }}>
          <h3 className="font-bold">{provider.id ? 'Edit provider' : 'Add provider'}</h3>
          <label className="block text-sm">Courier name<select required className="input mt-1" value={provider.name} disabled={!!provider.id} onChange={e => { const c = COURIERS.find(c => c.name === e.target.value); const existing = settings.providers.find(p => p.name === c?.name); setProvider({ id: existing?.id, name: c?.name || '', trackingUrl: c?.baseUrl || '', active: existing?.active ?? true }); }}><option value="">Select courier</option>{COURIERS.map(c => <option key={c.name}>{c.name}</option>)}</select></label>
          <label className="block text-sm">Official HTTPS tracking URL<input required readOnly type="url" className="input mt-1" value={provider.trackingUrl} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={provider.active} onChange={e => setProvider({ ...provider, active: e.target.checked })} />Active provider</label>
          <div className="flex gap-3"><button className="btn-primary" disabled={busy}>{busy && action === 'provider' ? <ButtonLoader label="Saving provider…" /> : 'Save provider'}</button>{provider.id && <button type="button" className="btn-ghost" onClick={() => setProvider({ name: '', trackingUrl: '', active: true })}>Cancel edit</button>}</div>
        </form>
      </div>
      <div className="card p-5 sm:p-6"><h2 className="font-serif text-xl font-bold">Delivery staff & permissions</h2><p className="mt-1 text-sm text-stone-500">Staff use /delivery/login. New accounts see assigned orders only.</p>
        <ul className="my-4 space-y-2">{settings.staff.map(s => <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#f9f2e6] p-3 text-sm"><span><b>{s.name}</b><span className="block text-xs">{s.phone} · {s.active ? (s.allOrders ? 'All orders' : 'Assigned only') : 'Disabled'}</span></span><div className="flex flex-wrap justify-end gap-2"><button className="btn-ghost !px-3 !py-2" onClick={() => setStaff({ ...s, password: '' })}>Manage {s.name}</button><button disabled={busy} className="btn-ghost !px-3 !py-2 !text-red-700" onClick={() => void deleteStaff(s)}>Delete {s.name}</button></div></li>)}</ul>
        <form className="space-y-3 border-t border-[#e7d6b8] pt-4" onSubmit={e => { e.preventDefault(); void save('staff', staff); }}>
          <h3 className="font-bold">{staff.id ? 'Manage staff account' : 'Create staff account'}</h3>
          <label className="block text-sm">Staff name<input required maxLength={120} className="input mt-1" value={staff.name} onChange={e => setStaff({ ...staff, name: e.target.value })} /></label>
          <label className="block text-sm">Staff mobile number<input required type="tel" maxLength={20} className="input mt-1" value={staff.phone} onChange={e => setStaff({ ...staff, phone: e.target.value })} /></label>
          <label className="block text-sm">{staff.id ? 'New password (leave blank to keep)' : 'Password (at least 12 characters)'}<input required={!staff.id} type="password" minLength={12} maxLength={72} autoComplete="new-password" className="input mt-1" value={staff.password} onChange={e => setStaff({ ...staff, password: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={staff.active} onChange={e => setStaff({ ...staff, active: e.target.checked })} />Account active</label>
          <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm"><input className="mt-1" type="checkbox" checked={staff.allOrders} onChange={e => setStaff({ ...staff, allOrders: e.target.checked })} /><span><b>Allow access to all orders</b><span className="block text-xs">Explicitly grants shared delivery access. Otherwise, only assigned shipments are visible.</span></span></label>
          <div className="flex gap-3"><button className="btn-primary" disabled={busy}>{busy && action === 'staff' ? <ButtonLoader label="Saving staff access…" /> : staff.id ? 'Save staff access' : 'Create delivery staff'}</button>{staff.id && <button type="button" className="btn-ghost" onClick={() => setStaff({ name: '', phone: '', active: true, allOrders: false, password: '' })}>Cancel edit</button>}</div>
        </form>
      </div>
    </div>
  </section>;
}
