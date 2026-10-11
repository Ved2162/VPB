"use client";
import { SectionLoader } from "@/components/loading";
import { useEffect, useState } from 'react';
import { BrandedLink as Link } from '@/components/loading';
import { Users, RefreshCw } from 'lucide-react';
import DeliverySettings from './delivery-settings';
import { deliveryRequest, type Settings } from './delivery-types';

export default function DeliveryAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    deliveryRequest<Settings>('/api/delivery/settings', { signal: controller.signal }).then(data => { if (controller.signal.aborted) return; setSettings(data); setError(''); }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [revision]);
  const reload = () => { setBusy(true); setRevision(n => n + 1); };
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.22em] text-[#7a1f1f]"><Users size={17} />VPB Admin</p><h1 className="mt-2 font-serif text-3xl font-bold">Staff & couriers</h1><p className="mt-2 text-sm text-stone-500">Manage delivery accounts, permissions and courier providers.</p></div><div className="flex gap-2"><Link href="/admin" className="btn-ghost">Main admin</Link><button className="btn-ghost" aria-label="Refresh staff and couriers" disabled={busy} onClick={reload}><RefreshCw size={16} /></button></div></header>
    {error && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}<button className="ml-3 underline" onClick={reload}>Retry</button><Link className="ml-3 underline" href="/admin/login">Admin login</Link></div>}
    <SectionLoader active={busy} compact={!!settings} label="Loading staff and couriers…" />
    {settings && <DeliverySettings settings={settings} reload={reload} />}
  </div>;
}
