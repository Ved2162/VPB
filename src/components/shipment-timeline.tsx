import { CourierTracking } from './courier-tracking';
import { statusLabel } from '@/lib/shipment-rules';

export type CustomerShipment = {
  status: string; courierName: string | null; docketNumber: string; trackingUrl: string; updatedAt: string | null;
  history: { id: string; status: string; previousStatus: string; courierName: string | null; docketNumber: string; createdAt: string }[];
};
export function ShipmentTimeline({ shipment }: { shipment: CustomerShipment }) {
  return <section className="mt-6 rounded-2xl border border-[#e7d6b8] bg-[#fffaf0] p-5" aria-label="Shipment tracking">
    <div className="flex flex-wrap justify-between gap-3"><h2 className="font-serif text-xl font-bold">Shipment tracking</h2><span className="pill bg-[#f6ead2] text-[#7a1f1f]">{statusLabel(shipment.status)}</span></div>
    <p className="mt-2 text-xs text-stone-500">Manually updated by the VPB delivery team.</p>
    <CourierTracking courier={shipment.courierName} docket={shipment.docketNumber} />
    {shipment.updatedAt && <p className="mt-3 text-xs text-stone-500">Last update: {new Date(shipment.updatedAt).toLocaleString('en-IN')}</p>}
    {!!shipment.history.length && <ol className="mt-5 space-y-4 border-l-2 border-[#c9a24b] pl-4">{shipment.history.map(event => <li key={event.id}>
      <p className="text-sm font-bold">{statusLabel(event.status)}{event.previousStatus === event.status ? ' · Courier details updated' : ''}</p>
      <p className="text-xs text-stone-600">{[event.courierName, event.docketNumber].filter(Boolean).join(' · ')}</p>
      <time className="text-xs text-stone-500">{new Date(event.createdAt).toLocaleString('en-IN')}</time>
    </li>)}</ol>}
  </section>;
}
